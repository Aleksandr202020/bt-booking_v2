import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addCalendarDays, getRigaNowParts } from '../server/domain/booking/dates'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for database constraint tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
let userId: string
let carId: string
let adminId: string

beforeAll(async () => {
  const [user] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Database Constraint Customer', ${`db-constraint-${suffix}@example.test`}, '+37100000021', 'test-only-hash', 'customer')
    RETURNING id
  `
  userId = user.id

  const [car] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${userId}, 'Test', 'Constraint Vehicle', ${`DC-${suffix}`}, 'passenger')
    RETURNING id
  `
  carId = car.id

  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Database Constraint Admin', ${`db-constraint-admin-${suffix}@example.test`}, '+37100000022', 'test-only-hash', 'admin')
    RETURNING id
  `
  adminId = admin.id
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE actor_id IN (${userId}, ${adminId}) OR target_id IN (${userId}, ${adminId})`
  await sql`DELETE FROM bookings WHERE user_id = ${userId}`
  await sql`DELETE FROM blocked_slots WHERE created_by = ${adminId}`
  await sql`DELETE FROM holidays WHERE name LIKE ${`Database constraint ${suffix}%`}`
  await sql`DELETE FROM cars WHERE user_id = ${userId}`
  await sql`DELETE FROM users WHERE id IN (${userId}, ${adminId})`
  await sql.end()
})

async function expectConstraintViolation(query: Promise<unknown>, constraint: string) {
  await expect(query).rejects.toMatchObject({ code: '23505' })
}

describe('database booking constraints', () => {
  it('enforces one active booking per date and time while allowing history rows', async () => {
    const { date: today } = getRigaNowParts()
    const bookingDate = addCalendarDays(today, 5)
    const bookingTime = '13:00'

    await sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
      VALUES (${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'pending')
    `

    await expectConstraintViolation(sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
      VALUES (${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'confirmed')
    `, 'bookings_one_active_slot_idx')

    await sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
      VALUES (${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'completed')
    `

    const rows = await sql`
      SELECT status FROM bookings
      WHERE user_id = ${userId} AND booking_date = ${bookingDate} AND booking_time = ${bookingTime}
      ORDER BY created_at
    `
    expect(rows.map((row) => row.status)).toEqual(['pending', 'completed'])
  })

  it('enforces unique whole-day and slot blocked entries', async () => {
    const { date: today } = getRigaNowParts()
    const wholeDay = addCalendarDays(today, 6)
    const slotDate = addCalendarDays(today, 7)

    await sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${wholeDay}, NULL, ${`Database constraint ${suffix} whole-day`}, ${adminId})
    `
    await expectConstraintViolation(sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${wholeDay}, NULL, ${`Database constraint ${suffix} duplicate whole-day`}, ${adminId})
    `, 'blocked_slots_whole_day_idx')

    await sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${slotDate}, '14:00', ${`Database constraint ${suffix} slot`}, ${adminId})
    `
    await expectConstraintViolation(sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${slotDate}, '14:00', ${`Database constraint ${suffix} duplicate slot`}, ${adminId})
    `, 'blocked_slots_slot_idx')
  })

  it('enforces one holiday row per date', async () => {
    const { date: today } = getRigaNowParts()
    const holidayDate = addCalendarDays(today, 8)

    await sql`
      INSERT INTO holidays (date, name, active)
      VALUES (${holidayDate}, ${`Database constraint ${suffix} holiday`}, TRUE)
    `
    await expectConstraintViolation(sql`
      INSERT INTO holidays (date, name, active)
      VALUES (${holidayDate}, ${`Database constraint ${suffix} duplicate holiday`}, TRUE)
    `, 'holidays_date_key')
  })
})
