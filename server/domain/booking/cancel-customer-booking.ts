import { createError } from 'h3'
import { getDb } from '../../utils/db'
import { isPastSlot } from './dates'
import { BOOKING_ERROR_CODES } from './booking-rules'

const ACTIVE_STATUSES = ['pending', 'confirmed'] as const

export async function cancelCustomerBooking(bookingId: string, userId: string) {
  const db = getDb()

  return db.begin(async (tx) => {
    // Keep the lock order consistent with admin booking updates: booking row first,
    // then the calendar-date advisory lock. The date lock serializes cancellation
    // with booking/block/holiday mutations for the same calendar date.
    const existingRows = await tx`
      SELECT id, user_id, booking_date, booking_time, status
      FROM bookings
      WHERE id = ${bookingId}
      FOR UPDATE
    `
    const booking = existingRows[0]

    if (!booking || booking.user_id !== userId || !ACTIVE_STATUSES.includes(booking.status)) {
      throw createError({
        statusCode: 404,
        statusMessage: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE',
        data: { code: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE' },
      })
    }

    const bookingDate = String(booking.booking_date).slice(0, 10)
    const bookingTime = String(booking.booking_time).slice(0, 5)
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`

    // Re-check the time after acquiring the date lock. This is deliberately done
    // inside the same transaction as the status update.
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
      RETURNING id, status, booking_date, booking_time
    `

    if (!rows.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE',
        data: { code: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE' },
      })
    }

    return rows[0]
  })
}
