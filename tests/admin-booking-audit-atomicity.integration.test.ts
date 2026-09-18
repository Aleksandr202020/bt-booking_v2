import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'
import { updateBooking } from '../server/domain/booking/update-booking'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for admin booking audit atomicity tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = Date.now().toString() + '-' + Math.random().toString(36).slice(2)
let userId: string
let carId: string

function addDaysIso(days: number) {
  const date = new Date()
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const bookingDate = addDaysIso(5)

beforeAll(async () => {
  const [user] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Audit Atomicity Test', ${`audit-atomicity-${suffix}@example.test`}, '+37100000009', 'test-only-hash', 'customer')
    RETURNING id
  `
  userId = user.id

  const [car] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${userId}, 'Test', 'Audit Vehicle', ${`AUD-${suffix}`}, 'passenger')
    RETURNING id
  `
  carId = car.id
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE target_id IN (SELECT id FROM bookings WHERE user_id = ${userId})`
  await sql`DELETE FROM bookings WHERE user_id = ${userId}`
  await sql`DELETE FROM cars WHERE user_id = ${userId}`
  await sql`DELETE FROM users WHERE id = ${userId}`
  await sql.end()
})

describe('admin booking audit atomicity', () => {
  it('rolls back admin booking creation when the audit insert fails', async () => {
    const invalidAuditActorId = '00000000-0000-0000-0000-000000000000'

    await expect(createBooking({
      userId,
      carId,
      bookingDate,
      bookingTime: '14:00',
      isAdmin: true,
      auditActorId: invalidAuditActorId,
      notes: 'should not persist',
    })).rejects.toBeDefined()

    const rows = await sql`
      SELECT id FROM bookings
      WHERE user_id = ${userId}
        AND booking_date = ${bookingDate}
        AND booking_time = '14:00'
    `
    expect(rows).toHaveLength(0)
  })

  it('rolls back the booking update when the audit insert fails', async () => {
    const booking = await createBooking({
      userId,
      carId,
      bookingDate,
      bookingTime: '15:00',
    })

    const invalidAuditActorId = '00000000-0000-0000-0000-000000000000'

    await expect(updateBooking({
      bookingId: booking.id,
      userId,
      carId,
      bookingDate,
      bookingTime: '16:00',
      status: 'confirmed',
      notes: 'should not persist',
      auditActorId: invalidAuditActorId,
    })).rejects.toBeDefined()

    const [row] = await sql`
      SELECT booking_time, notes
      FROM bookings
      WHERE id = ${booking.id}
    `

    expect(String(row.booking_time).slice(0, 5)).toBe('15:00')
    expect(row.notes).toBeNull()
  })
})
