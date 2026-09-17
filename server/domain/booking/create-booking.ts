import { createError } from 'h3'
import { getDb } from '../../utils/db'
import { getPriceCents } from '../pricing/pricing'
import { BOOKING_ERROR_CODES } from './booking-rules'
import { addCalendarDays, daysBetween, getRigaNowParts, isPastSlot, isValidIsoDate, isWorkingSlot } from './dates'

const DEFAULT_BOOKING_WINDOW_DAYS = 30

function fail(code: string, statusCode = 409): never {
  throw createError({ statusCode, statusMessage: code, data: { code } })
}

async function getCustomerWindow(now = new Date()) {
  const db = getDb()
  const settings = await db`
    SELECT value FROM app_settings WHERE key = 'customer_booking_window_days' LIMIT 1
  `
  const configured = settings[0]?.value
  const windowDays = typeof configured === 'number' ? configured : DEFAULT_BOOKING_WINDOW_DAYS
  const { date: today } = getRigaNowParts(now)
  return { start: today, end: addCalendarDays(today, windowDays), windowDays }
}

export async function isWithinCustomerBookingWindow(date: string, now = new Date()): Promise<boolean> {
  const { start, end } = await getCustomerWindow(now)
  return daysBetween(start, date) >= 0 && daysBetween(start, date) <= daysBetween(start, end)
}

export async function createBooking(input: {
  userId: string
  carId: string
  bookingDate: string
  bookingTime: string
  notes?: string | null
  isAdmin?: boolean
}) {
  if (!isValidIsoDate(input.bookingDate)) fail(BOOKING_ERROR_CODES.INVALID_DATE, 400)
  if (!isWorkingSlot(input.bookingTime)) fail(BOOKING_ERROR_CODES.INVALID_SLOT, 400)
  if (isPastSlot(input.bookingDate, input.bookingTime)) fail(BOOKING_ERROR_CODES.BOOKING_DATE_OUT_OF_RANGE)

  const window = !input.isAdmin ? await getCustomerWindow() : null
  if (window && (daysBetween(window.start, input.bookingDate) < 0 || daysBetween(window.start, input.bookingDate) > window.windowDays)) {
    fail(BOOKING_ERROR_CODES.BOOKING_DATE_OUT_OF_RANGE)
  }

  const db = getDb()
  return db.begin(async (tx) => {
    // Serialize booking/block/holiday mutations for this date before checking them.
    // This closes the race where a booking and a new block/holiday could otherwise commit together.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${input.bookingDate}`}))`

    // Customer booking limits span multiple dates, so date-level locking alone is not enough.
    // Serialize customer reservations by user as well, otherwise two concurrent requests for
    // different dates could both observe the same remaining limit and both commit.
    if (!input.isAdmin) {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${input.userId}`}))`
    }

    const users = await tx`
      SELECT id, banned FROM users WHERE id = ${input.userId} FOR SHARE
    `
    const user = users[0]
    if (!user) fail(BOOKING_ERROR_CODES.AUTH_REQUIRED, 401)
    if (user.banned) fail(BOOKING_ERROR_CODES.CLIENT_BANNED, 403)

    const cars = await tx`
      SELECT id, user_id, make, model, category
      FROM cars
      WHERE id = ${input.carId}
      LIMIT 1
    `
    const car = cars[0]
    if (!car) fail(BOOKING_ERROR_CODES.CAR_NOT_FOUND, 404)
    if (car.user_id !== input.userId) fail(BOOKING_ERROR_CODES.CAR_NOT_OWNED, 403)

    const holidays = await tx`
      SELECT id FROM holidays WHERE date = ${input.bookingDate} AND active = TRUE LIMIT 1
    `
    if (holidays.length) fail(BOOKING_ERROR_CODES.HOLIDAY)

    const blocked = await tx`
      SELECT id FROM blocked_slots
      WHERE booking_date = ${input.bookingDate}
        AND (booking_time = ${input.bookingTime} OR booking_time IS NULL)
      LIMIT 1
    `
    if (blocked.length) fail(BOOKING_ERROR_CODES.SLOT_BLOCKED)

    if (window) {
      const settings = await tx`
        SELECT key, value FROM app_settings
        WHERE key IN ('max_customer_bookings_in_window', 'max_customer_bookings_per_car_in_window')
      `
      const map = new Map(settings.map((row: any) => [row.key, row.value]))
      const maxTotal = typeof map.get('max_customer_bookings_in_window') === 'number' ? map.get('max_customer_bookings_in_window') : 3
      const maxCar = typeof map.get('max_customer_bookings_per_car_in_window') === 'number' ? map.get('max_customer_bookings_per_car_in_window') : 2

      const total = await tx`
        SELECT count(*)::int AS count FROM bookings
        WHERE user_id = ${input.userId}
          AND status IN ('pending', 'confirmed')
          AND booking_date BETWEEN ${window.start} AND ${window.end}
      `
      if (total[0].count >= maxTotal) fail(BOOKING_ERROR_CODES.BOOKING_LIMIT_REACHED)

      const perCar = await tx`
        SELECT count(*)::int AS count FROM bookings
        WHERE user_id = ${input.userId}
          AND car_id = ${input.carId}
          AND status IN ('pending', 'confirmed')
          AND booking_date BETWEEN ${window.start} AND ${window.end}
      `
      if (perCar[0].count >= maxCar) fail(BOOKING_ERROR_CODES.CAR_BOOKING_LIMIT_REACHED)
    }

    const priceCents = getPriceCents(car.category)
    try {
      const inserted = await tx`
        INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status, notes)
        VALUES (${input.userId}, ${input.carId}, ${input.bookingDate}, ${input.bookingTime}, ${priceCents}, 'confirmed', ${input.notes ?? null})
        RETURNING *
      `
      return inserted[0]
    } catch (error: any) {
      if (error?.code === '23505') fail(BOOKING_ERROR_CODES.SLOT_UNAVAILABLE)
      throw error
    }
  })
}
