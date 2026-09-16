import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSlotAvailability } from '../server/domain/availability/availability'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for availability DB integration tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const email = `availability-test-${suffix}@example.test`
const testDate = '2099-11-15'
let userId: string
let carId: string
let bookingId: string

beforeAll(async () => {
  const [user] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Availability Integration Test', ${email}, '+37100000001', 'test-only-hash', 'admin')
    RETURNING id
  `
  userId = user.id

  const [car] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${userId}, 'Test', 'Availability Vehicle', ${`AVL-${suffix}`}, 'passenger')
    RETURNING id
  `
  carId = car.id
})

afterAll(async () => {
  await sql`DELETE FROM bookings WHERE booking_date = ${testDate} AND user_id = ${userId}`
  await sql`DELETE FROM blocked_slots WHERE booking_date = ${testDate} AND created_by = ${userId}`
  await sql`DELETE FROM holidays WHERE date = ${testDate}`
  await sql`DELETE FROM cars WHERE id = ${carId}`
  await sql`DELETE FROM users WHERE id = ${userId}`
  await sql.end()
})

describe('PostgreSQL availability integration', () => {
  it('returns all 12 slots and reflects booked, blocked and free states', async () => {
    const [booking] = await sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
      VALUES (${userId}, ${carId}, ${testDate}, '10:00', 2500, 'confirmed')
      RETURNING id
    `
    bookingId = booking.id

    await sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${testDate}, '11:00', 'Integration test slot block', ${userId})
    `

    const slots = await getSlotAvailability(testDate, 'admin')
    expect(slots).toHaveLength(12)
    expect(slots.map((slot) => slot.time)).toEqual([
      '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
      '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
    ])
    expect(slots.find((slot) => slot.time === '09:00')?.state).toBe('available')
    expect(slots.find((slot) => slot.time === '10:00')?.state).toBe('booked')
    expect(slots.find((slot) => slot.time === '10:00')?.bookingId).toBe(bookingId)
    expect(slots.find((slot) => slot.time === '11:00')?.state).toBe('blocked')
    expect(slots.find((slot) => slot.time === '11:00')?.reason).toBe('Integration test slot block')

    await sql`UPDATE bookings SET status = 'cancelled_customer' WHERE id = ${bookingId}`
    const afterCancel = await getSlotAvailability(testDate, 'admin')
    expect(afterCancel.find((slot) => slot.time === '10:00')?.state).toBe('available')
    expect(afterCancel.find((slot) => slot.time === '10:00')?.bookingId).toBeNull()
  })

  it('marks every slot as blocked for a whole-day block', async () => {
    await sql`DELETE FROM blocked_slots WHERE booking_date = ${testDate} AND created_by = ${userId}`
    await sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${testDate}, NULL, 'Integration test whole-day block', ${userId})
    `

    const slots = await getSlotAvailability(testDate, 'admin')
    expect(slots).toHaveLength(12)
    expect(slots.every((slot) => slot.state === 'blocked')).toBe(true)
    expect(slots.every((slot) => slot.available === false)).toBe(true)
  })

  it('marks every slot as holiday on an active holiday', async () => {
    await sql`DELETE FROM blocked_slots WHERE booking_date = ${testDate} AND created_by = ${userId}`

    await sql`
      INSERT INTO holidays (date, name, active)
      VALUES (${testDate}, 'Integration Test Holiday', TRUE)
    `

    const slots = await getSlotAvailability(testDate, 'admin')
    expect(slots).toHaveLength(12)
    expect(slots.every((slot) => slot.state === 'holiday')).toBe(true)
    expect(slots.every((slot) => slot.available === false)).toBe(true)
  })
})
