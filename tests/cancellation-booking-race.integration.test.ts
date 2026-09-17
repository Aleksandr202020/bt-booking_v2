import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'
import { cancelCustomerBooking } from '../server/domain/booking/cancel-customer-booking'
import { addCalendarDays, getRigaNowParts } from '../server/domain/booking/dates'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for cancellation-booking race tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const customerAEmail = `cancel-booking-a-${suffix}@example.test`
const customerBEmail = `cancel-booking-b-${suffix}@example.test`
let customerAId: string
let customerBId: string
let carAId: string
let carBId: string

type CancellationBookingOutcome = 'cancelled' | 'booking-created' | 'booking-rejected'

beforeAll(async () => {
  const [customerA] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Cancellation Booking Race A', ${customerAEmail}, '+37100000004', 'test-only-hash', 'customer')
    RETURNING id
  `
  customerAId = customerA.id

  const [customerB] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Cancellation Booking Race B', ${customerBEmail}, '+37100000005', 'test-only-hash', 'customer')
    RETURNING id
  `
  customerBId = customerB.id

  const [carA] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerAId}, 'Test', 'Cancellation Race A', ${`CB-A-${suffix}`}, 'passenger')
    RETURNING id
  `
  carAId = carA.id

  const [carB] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerBId}, 'Test', 'Cancellation Race B', ${`CB-B-${suffix}`}, 'passenger')
    RETURNING id
  `
  carBId = carB.id
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE actor_id IN (${customerAId}, ${customerBId})`
  await sql`DELETE FROM bookings WHERE user_id IN (${customerAId}, ${customerBId})`
  await sql`DELETE FROM cars WHERE user_id IN (${customerAId}, ${customerBId})`
  await sql`DELETE FROM users WHERE id IN (${customerAId}, ${customerBId})`
  await sql.end()
})

describe('cancellation ↔ booking concurrency', () => {
  it('serializes customer cancellation against a competing booking for the same slot', async () => {
    const { date: today } = getRigaNowParts()
    const bookingDate = addCalendarDays(today, 1)
    const bookingTime = '17:00'

    const [existing] = await sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status, notes)
      VALUES (${customerAId}, ${carAId}, ${bookingDate}, ${bookingTime}, 2500, 'confirmed', NULL)
      RETURNING id
    `
    const existingBookingId = existing.id

    const attemptCancellation = async (): Promise<CancellationBookingOutcome> => {
      await cancelCustomerBooking(existingBookingId, customerAId)
      return 'cancelled'
    }

    const attemptBooking = async (): Promise<CancellationBookingOutcome> => {
      try {
        await createBooking({
          userId: customerBId,
          carId: carBId,
          bookingDate,
          bookingTime,
        })
        return 'booking-created'
      } catch (error: any) {
        if (error?.data?.code === 'SLOT_UNAVAILABLE') return 'booking-rejected'
        throw error
      }
    }

    const results = await Promise.allSettled([attemptCancellation(), attemptBooking()])
    const fulfilled = results
      .filter((result): result is PromiseFulfilledResult<CancellationBookingOutcome> => result.status === 'fulfilled')
      .map((result) => result.value)
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(rejected).toHaveLength(0)
    expect(fulfilled).toContain('cancelled')
    expect(fulfilled).toHaveLength(2)
    expect(fulfilled.filter((outcome) => outcome === 'booking-created' || outcome === 'booking-rejected')).toHaveLength(1)

    const [original] = await sql`
      SELECT status FROM bookings WHERE id = ${existingBookingId}
    `
    expect(original.status).toBe('cancelled_customer')

    const activeBookings = await sql`
      SELECT user_id FROM bookings
      WHERE booking_date = ${bookingDate}
        AND booking_time = ${bookingTime}
        AND status IN ('pending', 'confirmed')
    `
    const bookingOutcome = fulfilled.find((outcome) => outcome !== 'cancelled')
    if (bookingOutcome === 'booking-created') {
      expect(activeBookings).toHaveLength(1)
      expect(activeBookings[0].user_id).toBe(customerBId)
    } else {
      expect(activeBookings).toHaveLength(0)
    }

    const audits = await sql`
      SELECT action, target_id
      FROM audit_logs
      WHERE action = 'booking.cancelled_customer'
        AND (actor_id = ${customerAId} OR actor_id = ${customerBId})
    `
    expect(audits.filter((row) => row.action === 'booking.cancelled_customer')).toHaveLength(1)

    await sql`DELETE FROM bookings WHERE booking_date = ${bookingDate} AND booking_time = ${bookingTime}`
    await sql`
      DELETE FROM audit_logs
      WHERE target_id = ${existingBookingId}
         OR actor_id IN (${customerAId}, ${customerBId})
    `
  })
})
