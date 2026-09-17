import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cancelCustomerBooking } from '../server/domain/booking/cancel-customer-booking'
import { createBooking } from '../server/domain/booking/create-booking'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for customer cancellation race tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const email = `cancel-race-${suffix}@example.test`
let userId: string
let carId: string

function isoDate(daysAhead: number) {
  const date = new Date()
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + daysAhead)
  return date.toISOString().slice(0, 10)
}

beforeAll(async () => {
  const [user] = await sql`
    INSERT INTO users (name, email, phone, password_hash)
    VALUES ('Cancellation Race Test', ${email}, '+37100000001', 'test-only-hash')
    RETURNING id
  `
  userId = user.id

  const [car] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${userId}, 'Test', 'Cancellation Vehicle', ${`CANCEL-${suffix}`}, 'passenger')
    RETURNING id
  `
  carId = car.id
})

afterAll(async () => {
  if (userId) {
    await sql`DELETE FROM bookings WHERE user_id = ${userId}`
    await sql`DELETE FROM cars WHERE user_id = ${userId}`
    await sql`DELETE FROM users WHERE id = ${userId}`
  }
  await sql.end()
})

describe('customer cancellation concurrency', () => {
  it('serializes cancellation against a competing booking for the same slot', async () => {
    const bookingDate = isoDate(5)
    const bookingTime = '10:00'

    const [booking] = await sql`
      INSERT INTO bookings (
        user_id, car_id, booking_date, booking_time, price_cents, status
      )
      VALUES (${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'confirmed')
      RETURNING id
    `

    const results = await Promise.allSettled([
      cancelCustomerBooking(booking.id, userId),
      createBooking({
        userId,
        carId,
        bookingDate,
        bookingTime,
      }),
    ])

    expect(results[0].status).toBe('fulfilled')

    const createResult = results[1]
    const activeRows = await sql`
      SELECT id, status
      FROM bookings
      WHERE booking_date = ${bookingDate}
        AND booking_time = ${bookingTime}
        AND status IN ('pending', 'confirmed')
    `

    if (createResult.status === 'fulfilled') {
      // Cancellation acquired the date lock first, then the replacement booking acquired it.
      expect(activeRows).toHaveLength(1)
      expect(activeRows[0].id).not.toBe(booking.id)
    } else {
      // Booking acquired the date lock first, saw the active booking, and lost the race.
      expect(createResult.reason?.data?.code).toBe('SLOT_UNAVAILABLE')
      expect(activeRows).toHaveLength(0)
    }

    const originalRows = await sql`
      SELECT status FROM bookings WHERE id = ${booking.id}
    `
    expect(originalRows[0].status).toBe('cancelled_customer')

    await sql`DELETE FROM bookings WHERE booking_date = ${bookingDate} AND booking_time = ${bookingTime}`
  })
})
