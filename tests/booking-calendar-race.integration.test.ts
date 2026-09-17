import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'
import { addCalendarDays, getRigaNowParts } from '../server/domain/booking/dates'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for booking/calendar race tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
let userId: string
let carId: string
let adminId: string

type Outcome = 'booking-created' | 'booking-rejected' | 'calendar-created' | 'calendar-rejected'

beforeAll(async () => {
  const [user] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Booking Calendar Race Customer', ${`booking-calendar-${suffix}@example.test`}, '+37100000011', 'test-only-hash', 'customer')
    RETURNING id
  `
  userId = user.id

  const [car] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${userId}, 'Test', 'Calendar Race Vehicle', ${`BC-${suffix}`}, 'passenger')
    RETURNING id
  `
  carId = car.id

  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Booking Calendar Race Admin', ${`booking-calendar-admin-${suffix}@example.test`}, '+37100000012', 'test-only-hash', 'admin')
    RETURNING id
  `
  adminId = admin.id
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE actor_id IN (${userId}, ${adminId}) OR target_id IN (${userId}, ${adminId})`
  await sql`DELETE FROM bookings WHERE user_id = ${userId}`
  await sql`DELETE FROM blocked_slots WHERE created_by = ${adminId}`
  await sql`DELETE FROM holidays WHERE name LIKE ${`Booking calendar race ${suffix}%`}`
  await sql`DELETE FROM cars WHERE user_id = ${userId}`
  await sql`DELETE FROM users WHERE id IN (${userId}, ${adminId})`
  await sql.end()
})

async function runBookingVsCalendarMutation(
  bookingDate: string,
  bookingTime: string,
  calendarMutation: (tx: postgres.TransactionSql<{}>) => Promise<'calendar-created' | 'calendar-rejected'>,
) {
  const attemptBooking = async (): Promise<Outcome> => {
    try {
      await createBooking({ userId, carId, bookingDate, bookingTime })
      return 'booking-created'
    } catch (error: any) {
      if (error?.data?.code === 'HOLIDAY' || error?.data?.code === 'SLOT_BLOCKED') return 'booking-rejected'
      throw error
    }
  }

  const attemptCalendar = async (): Promise<Outcome> => sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`
    return calendarMutation(tx)
  })

  const results = await Promise.all([attemptBooking(), attemptCalendar()])
  expect(new Set(results)).toEqual(new Set<Outcome>(['booking-created', 'calendar-rejected']))
    
  const [booking] = await sql`
    SELECT id FROM bookings
    WHERE user_id = ${userId}
      AND booking_date = ${bookingDate}
      AND booking_time = ${bookingTime}
      AND status IN ('pending', 'confirmed')
  `
  expect(booking?.id).toBeTruthy()
}

describe('booking ↔ calendar concurrency', () => {
  it('serializes booking creation against a concurrent blocked-slot creation', async () => {
    const { date: today } = getRigaNowParts()
    const bookingDate = addCalendarDays(today, 3)
    const bookingTime = '17:00'

    await runBookingVsCalendarMutation(bookingDate, bookingTime, async (tx) => {
      const activeBooking = await tx`
        SELECT id FROM bookings
        WHERE booking_date = ${bookingDate}
          AND booking_time = ${bookingTime}
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBooking.length) return 'calendar-rejected'

      await tx`
        INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
        VALUES (${bookingDate}, ${bookingTime}, ${`Booking calendar race ${suffix} block`}, ${adminId})
      `
      return 'calendar-created'
    })

    await sql`DELETE FROM bookings WHERE user_id = ${userId} AND booking_date = ${bookingDate}`
    await sql`DELETE FROM blocked_slots WHERE booking_date = ${bookingDate}`
  })

  it('serializes booking creation against a concurrent holiday creation', async () => {
    const { date: today } = getRigaNowParts()
    const bookingDate = addCalendarDays(today, 4)
    const bookingTime = '18:00'

    await runBookingVsCalendarMutation(bookingDate, bookingTime, async (tx) => {
      const activeBooking = await tx`
        SELECT id FROM bookings
        WHERE booking_date = ${bookingDate}
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBooking.length) return 'calendar-rejected'

      await tx`
        INSERT INTO holidays (date, name, active)
        VALUES (${bookingDate}, ${`Booking calendar race ${suffix} holiday`}, TRUE)
      `
      return 'calendar-created'
    })

    await sql`DELETE FROM bookings WHERE user_id = ${userId} AND booking_date = ${bookingDate}`
    await sql`DELETE FROM holidays WHERE date = ${bookingDate}`
  })
})
