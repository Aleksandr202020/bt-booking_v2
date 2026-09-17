import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'
import { updateBooking } from '../server/domain/booking/update-booking'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for booking update race tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const customerEmail = `booking-update-race-customer-${suffix}@example.test`
const adminEmail = `booking-update-race-admin-${suffix}@example.test`

let customerId: string
let adminId: string
let customerCarId: string
let adminCarId: string

function addDaysIso(days: number) {
  const date = new Date()
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const bookingDate = addDaysIso(3)

beforeAll(async () => {
  const [customer] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Booking Update Race Customer', ${customerEmail}, '+37100000011', 'test-only-hash', 'customer')
    RETURNING id
  `
  customerId = customer.id

  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Booking Update Race Admin', ${adminEmail}, '+37100000012', 'test-only-hash', 'admin')
    RETURNING id
  `
  adminId = admin.id

  const [customerCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Test', 'Update Race Customer Car', ${`UR-C-${suffix}`}, 'passenger')
    RETURNING id
  `
  customerCarId = customerCar.id

  const [adminCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${adminId}, 'Test', 'Update Race Admin Car', ${`UR-A-${suffix}`}, 'passenger')
    RETURNING id
  `
  adminCarId = adminCar.id
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE actor_id IN (${customerId}, ${adminId}) OR target_id IN (${customerId}, ${adminId})`
  await sql`DELETE FROM bookings WHERE user_id IN (${customerId}, ${adminId})`
  await sql`DELETE FROM cars WHERE user_id IN (${customerId}, ${adminId})`
  await sql`DELETE FROM users WHERE id IN (${customerId}, ${adminId})`
  await sql.end()
})

describe('booking update ↔ update concurrency', () => {
  it('serializes two active updates competing for the same target slot', async () => {
    const first = await createBooking({
      userId: customerId,
      carId: customerCarId,
      bookingDate,
      bookingTime: '09:00',
    })
    const second = await createBooking({
      userId: adminId,
      carId: adminCarId,
      bookingDate,
      bookingTime: '10:00',
      isAdmin: true,
    })

    const firstUpdate = updateBooking({
      bookingId: first.id,
      userId: customerId,
      carId: customerCarId,
      bookingDate,
      bookingTime: '11:00',
      status: 'confirmed',
      auditActorId: adminId,
    })

    const secondUpdate = updateBooking({
      bookingId: second.id,
      userId: adminId,
      carId: adminCarId,
      bookingDate,
      bookingTime: '11:00',
      status: 'confirmed',
      auditActorId: adminId,
    })

    const results = await Promise.allSettled([firstUpdate, secondUpdate])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({ data: { code: 'SLOT_UNAVAILABLE' } }),
    })

    const targetBookings = await sql`
      SELECT id, user_id
      FROM bookings
      WHERE booking_date = ${bookingDate}
        AND booking_time = '11:00'
        AND status IN ('pending', 'confirmed')
    `
    expect(targetBookings).toHaveLength(1)

    const sourceBookings = await sql`
      SELECT id, booking_time
      FROM bookings
      WHERE id IN (${first.id}, ${second.id})
        AND status IN ('pending', 'confirmed')
    `
    expect(sourceBookings).toHaveLength(2)

    const winningId = targetBookings[0].id
    const losingId = winningId === first.id ? second.id : first.id
    const [losing] = sourceBookings.filter((row) => row.id === losingId)
    expect(String(losing.booking_time).slice(0, 5)).toBe(winningId === first.id ? '10:00' : '09:00')

    const audits = await sql`
      SELECT action, target_id
      FROM audit_logs
      WHERE action = 'booking.updated'
        AND target_id IN (${first.id}, ${second.id})
    `
    expect(audits).toHaveLength(1)

    await sql`DELETE FROM bookings WHERE id IN (${first.id}, ${second.id})`
    await sql`DELETE FROM audit_logs WHERE target_id IN (${first.id}, ${second.id})`
  })
})
