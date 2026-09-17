import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'
import { updateBooking, cancelAdminBooking } from '../server/domain/booking/update-booking'
import { addCalendarDays, getRigaNowParts } from '../server/domain/booking/dates'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for admin booking flow tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
let customerId: string
let customerSecondId: string
let adminId: string
let customerPassengerCarId: string
let customerSecondCarId: string
let testDate: string

beforeAll(async () => {
  const { date } = getRigaNowParts()
  testDate = addCalendarDays(date, 3)

  const [customer] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Admin Flow Customer', ${`admin-flow-${suffix}@example.test`}, '+37100000001', 'test-only-hash', 'customer')
    RETURNING id
  `
  customerId = customer.id

  const [customerSecond] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Admin Flow Customer 2', ${`admin-flow-2-${suffix}@example.test`}, '+37100000002', 'test-only-hash', 'customer')
    RETURNING id
  `
  customerSecondId = customerSecond.id

  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Admin Flow Admin', ${`admin-flow-admin-${suffix}@example.test`}, '+37100000003', 'test-only-hash', 'admin')
    RETURNING id
  `
  adminId = admin.id

  const [passengerCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Test', 'Admin Flow Passenger', ${`AF-P-${suffix}`}, 'passenger')
    RETURNING id
  `
  customerPassengerCarId = passengerCar.id

  const [secondCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerSecondId}, 'Test', 'Admin Flow Second', ${`AF-S-${suffix}`}, 'passenger')
    RETURNING id
  `
  customerSecondCarId = secondCar.id
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE actor_id IN (${adminId}, ${customerId}, ${customerSecondId}) OR target_id IN (${adminId}, ${customerId}, ${customerSecondId})`
  await sql`DELETE FROM bookings WHERE user_id IN (${customerId}, ${customerSecondId})`
  await sql`DELETE FROM blocked_slots WHERE created_by = ${adminId}`
  await sql`DELETE FROM holidays WHERE name LIKE ${`Admin Flow ${suffix}%`}`
  await sql`DELETE FROM cars WHERE user_id IN (${customerId}, ${customerSecondId})`
  await sql`DELETE FROM users WHERE id IN (${customerId}, ${customerSecondId}, ${adminId})`
  await sql.end()
})

// ...
