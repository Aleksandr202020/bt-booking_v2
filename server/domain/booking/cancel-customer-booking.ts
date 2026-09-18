import { createError } from 'h3'
import { getDb } from '../../utils/db'
import { isPastSlot } from './dates'
import { BOOKING_ERROR_CODES } from './booking-rules'
import { writeAuditLog } from '../../utils/audit'

const ACTIVE_STATUSES = ['pending', 'confirmed'] as const

export async function cancelCustomerBooking(bookingId: string, userId: string) {
  const db = getDb()

  return db.begin(async (tx) => {
    // Acquire the same advisory locks used by booking creation/update before
    // taking the booking row lock. This prevents cancellation↔creation deadlocks.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${userId}`}))`

    const snapshotRows = await tx`
      SELECT id, user_id, car_id, booking_date, booking_time, price_cents, status, notes
      FROM bookings
      WHERE id = ${bookingId}
    `
    const snapshot = snapshotRows[0]

    if (!snapshot || snapshot.user_id !== userId || !ACTIVE_STATUSES.includes(snapshot.status)) {
      throw createError({
        statusCode: 404,
        statusMessage: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE',
        data: { code: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE' },
      })
    }

    const bookingDate = String(snapshot.booking_date).slice(0, 10)
    const bookingTime = String(snapshot.booking_time).slice(0, 5)
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`

    const existingRows = await tx`
      SELECT id, user_id, car_id, booking_date, booking_time, price_cents, status, notes
      FROM bookings
      WHERE id = ${bookingId}
      FOR UPDATE
    `
    const booking = existingRows[0]

    // The source row may have changed while advisory locks were being acquired.
    // Abort rather than operating on stale ownership/date/status information.
    if (
      !booking ||
      booking.user_id !== userId ||
      String(booking.booking_date).slice(0, 10) !== bookingDate ||
      !ACTIVE_STATUSES.includes(booking.status)
    ) {
      throw createError({
        statusCode: 404,
        statusMessage: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE',
        data: { code: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE' },
      })
    }

    // Re-check the time after acquiring all locks, inside the same transaction.
    if (isPastSlot(bookingDate, bookingTime)) {
      throw createError({
        statusCode: 404,
        statusMessage: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE',
        data: { code: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE' },
      })
    }

    const rows = await tx`
      UPDATE bookings
      SET status = 'cancelled_customer', updated_at = now()
      WHERE id = ${booking.id}
        AND user_id = ${userId}
        AND status IN ('pending', 'confirmed')
      RETURNING id, user_id, car_id, status, booking_date, booking_time, price_cents, notes
    `

    if (!rows.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE',
        data: { code: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE' },
      })
    }

    const cancelled = rows[0]
    await writeAuditLog({
      actorId: userId,
      action: 'booking.cancelled_customer',
      targetId: cancelled.id,
      metadata: {
        bookingDate: cancelled.booking_date,
        bookingTime: cancelled.booking_time,
        previousStatus: booking.status,
        previous: {
          userId: booking.user_id,
          bookingDate: booking.booking_date,
          bookingTime: booking.booking_time,
          status: booking.status,
          carId: booking.car_id,
          priceCents: booking.price_cents,
          notes: booking.notes,
        },
        current: {
          userId: cancelled.user_id,
          bookingDate: cancelled.booking_date,
          bookingTime: cancelled.booking_time,
          status: cancelled.status,
          carId: cancelled.car_id,
          priceCents: cancelled.price_cents,
          notes: cancelled.notes,
        },
      },
    }, tx)

    return cancelled
  })
}
