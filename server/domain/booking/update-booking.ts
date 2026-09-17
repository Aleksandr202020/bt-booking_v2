import { createError } from 'h3'
import { getDb } from '../../utils/db'
import { getPriceCents } from '../pricing/pricing'
import { BOOKING_ERROR_CODES } from './booking-rules'
import { isPastSlot, isValidIsoDate, isWorkingSlot } from './dates'

const STATUS_VALUES = ['pending', 'confirmed', 'completed', 'cancelled_customer', 'cancelled_admin', 'no_show'] as const
export type BookingStatus = typeof STATUS_VALUES[number]

function fail(code: string, statusCode = 409): never {
  throw createError({ statusCode, statusMessage: code, data: { code } })
}

function isActiveStatus(status: BookingStatus): boolean {
  return status === 'pending' || status === 'confirmed'
}

export async function updateBooking(input: {
  bookingId: string
  userId: string
  carId: string
  bookingDate: string
  bookingTime: string
  status: BookingStatus
  notes?: string | null
}) {
  if (!isValidIsoDate(input.bookingDate)) fail(BOOKING_ERROR_CODES.INVALID_DATE, 400)
  if (!isWorkingSlot(input.bookingTime)) fail(BOOKING_ERROR_CODES.INVALID_SLOT, 400)

  const db = getDb()
  const active = isActiveStatus(input.status)

  return db.begin(async (tx) => {
    // Lock the booking row first so the current source date is known and cannot become stale.
    // Then serialize every affected calendar date in a deterministic order. This prevents an
    // active booking moved from date A to date B from racing with a booking/block/holiday on A.
    const existingRows = await tx`
      SELECT id, booking_date, status FROM bookings WHERE id = ${input.bookingId} FOR UPDATE
    `
    const existing = existingRows[0]
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'BOOKING_NOT_FOUND', data: { code: 'BOOKING_NOT_FOUND' } })
    }

    if (active) {
      const dates = [String(existing.booking_date).slice(0, 10), input.bookingDate].sort()
      for (const date of [...new Set(dates)]) {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${date}`}))`
      }
    }

    const targetUserRows = await tx`
      SELECT id, banned FROM users WHERE id = ${input.userId} LIMIT 1
    `
    const targetUser = targetUserRows[0]
    if (!targetUser) throw createError({ statusCode: 404, statusMessage: 'USER_NOT_FOUND', data: { code: 'USER_NOT_FOUND' } })
    if (targetUser.banned && active) {
      fail(BOOKING_ERROR_CODES.CLIENT_BANNED, 403)
    }

    const cars = await tx`
      SELECT id, user_id, category FROM cars WHERE id = ${input.carId} LIMIT 1
    `
    const car = cars[0]
    if (!car) fail(BOOKING_ERROR_CODES.CAR_NOT_FOUND, 404)
    if (car.user_id !== input.userId) fail(BOOKING_ERROR_CODES.CAR_NOT_OWNED, 403)

    if (active) {
      if (isPastSlot(input.bookingDate, input.bookingTime)) fail(BOOKING_ERROR_CODES.BOOKING_DATE_OUT_OF_RANGE)

      const holiday = await tx`
        SELECT 1 FROM holidays WHERE date = ${input.bookingDate} AND active = TRUE LIMIT 1
      `
      if (holiday.length) fail(BOOKING_ERROR_CODES.HOLIDAY)

      const blocked = await tx`
        SELECT 1 FROM blocked_slots
        WHERE booking_date = ${input.bookingDate}
          AND (booking_time = ${input.bookingTime} OR booking_time IS NULL)
        LIMIT 1
      `
      if (blocked.length) fail(BOOKING_ERROR_CODES.SLOT_BLOCKED)
    }

    try {
      const rows = await tx`
        UPDATE bookings
        SET user_id = ${input.userId},
            car_id = ${input.carId},
            booking_date = ${input.bookingDate},
            booking_time = ${input.bookingTime},
            price_cents = ${getPriceCents(car.category)},
            status = ${input.status},
            notes = ${input.notes ?? null},
            updated_at = now()
        WHERE id = ${input.bookingId}
        RETURNING *
      `
      return rows[0]
    } catch (error: any) {
      if (error?.code === '23505') fail(BOOKING_ERROR_CODES.SLOT_UNAVAILABLE)
      throw error
    }
  })
}

export async function cancelAdminBooking(bookingId: string) {
  const db = getDb()

  return db.begin(async (tx) => {
    const existingRows = await tx`
      SELECT id, user_id, car_id, booking_date, booking_time, status, notes
      FROM bookings
      WHERE id = ${bookingId}
      FOR UPDATE
    `
    const booking = existingRows[0]
    if (!booking) {
      throw createError({ statusCode: 404, statusMessage: 'BOOKING_NOT_FOUND', data: { code: 'BOOKING_NOT_FOUND' } })
    }

    if (!isActiveStatus(booking.status as BookingStatus)) {
      throw createError({ statusCode: 409, statusMessage: 'BOOKING_NOT_CANCELLABLE', data: { code: 'BOOKING_NOT_CANCELLABLE' } })
    }

    const rows = await tx`
      UPDATE bookings
      SET status = 'cancelled_admin', updated_at = now()
      WHERE id = ${booking.id} AND status IN ('pending', 'confirmed')
      RETURNING *
    `
    if (!rows.length) {
      throw createError({ statusCode: 409, statusMessage: 'BOOKING_NOT_CANCELLABLE', data: { code: 'BOOKING_NOT_CANCELLABLE' } })
    }
    return rows[0]
  })
}

export function isValidBookingStatus(value: string): value is BookingStatus {
  return (STATUS_VALUES as readonly string[]).includes(value)
}
