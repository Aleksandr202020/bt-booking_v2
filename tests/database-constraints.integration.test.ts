import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
  await expect(query).rejects.toMatchObject({ code: '23505', constraint_name: constraint })
}

async function expectCheckViolation(query: Promise<unknown>, constraint: string) {
  await expect(query).rejects.toMatchObject({ code: '23514', constraint_name: constraint })
}

describe('database booking constraints', () => {
  it('enforces numeric bounds for booking settings at the database boundary', async () => {
    await expectCheckViolation(sql`
      UPDATE app_settings
      SET value = '"30"'::jsonb
      WHERE key = 'customer_booking_window_days'
    `, 'app_settings_booking_limits_chk')

    await expectCheckViolation(sql`
      UPDATE app_settings
      SET value = '0'::jsonb
      WHERE key = 'max_customer_bookings_in_window'
    `, 'app_settings_booking_limits_chk')

    await expectCheckViolation(sql`
      UPDATE app_settings
      SET value = '366'::jsonb
      WHERE key = 'customer_booking_window_days'
    `, 'app_settings_booking_limits_chk')

    await sql`
      UPDATE app_settings SET value = '30'::jsonb WHERE key = 'customer_booking_window_days'
    `
  })

  it('enforces valid one-hour booking and blocked-slot times at the database boundary', async () => {
    const bookingDate = '2099-12-10'

    await expectCheckViolation(sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
      VALUES (${userId}, ${carId}, ${bookingDate}, '08:00', 2500, 'pending')
    `, 'bookings_booking_time_slot_chk')

    await expectCheckViolation(sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
      VALUES (${userId}, ${carId}, ${bookingDate}, '20:30', 2500, 'pending')
    `, 'bookings_booking_time_slot_chk')

    await expectCheckViolation(sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${bookingDate}, '13:30', ${`Database constraint ${suffix} invalid slot`}, ${adminId})
    `, 'blocked_slots_booking_time_slot_chk')
  })

  it('enforces case-insensitive unique vehicle registration numbers', async () => {
    await expectConstraintViolation(sql`
      INSERT INTO cars (user_id, make, model, registration_number, category)
      VALUES (${userId}, 'Test', 'Duplicate Vehicle', ${`dc-${suffix}`}, 'passenger')
    `, 'cars_registration_number_ci_idx')
  })

  it('enforces one active booking per date and time while allowing history rows', async () => {
    const bookingDate = '2099-12-11'
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
    const wholeDay = '2099-12-12'
    const slotDate = '2099-12-13'

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
    const holidayDate = '2099-12-14'

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
