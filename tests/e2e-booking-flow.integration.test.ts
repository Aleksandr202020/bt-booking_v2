import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSlotAvailability } from '../server/domain/availability/availability'
import { createBooking } from '../server/domain/booking/create-booking'
import { addCalendarDays, getRigaNowParts } from '../server/domain/booking/dates'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for booking flow integration tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const customerEmail = `flow-customer-${suffix}@example.test`
const adminEmail = `flow-admin-${suffix}@example.test`
let customerId: string
let adminId: string
let customerCarId: string
let adminCarId: string
const testDate = addCalendarDays(getRigaNowParts().date, 1)
const holidayDate = addCalendarDays(testDate, 1)
const slot = '15:00'

beforeAll(async () => {
  const [customer] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role, banned)
    VALUES ('Flow Customer', ${customerEmail}, '+37100000002', 'test-only-hash', 'customer', FALSE)
    RETURNING id
  `
  customerId = customer.id

  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role, banned)
    VALUES ('Flow Admin', ${adminEmail}, '+37100000003', 'test-only-hash', 'admin', FALSE)
    RETURNING id
  `
  adminId = admin.id

  const [customerCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Test', 'Flow Customer Car', ${`FLOW-C-${suffix}`}, 'crossover')
    RETURNING id
  `
  customerCarId = customerCar.id

  const [adminCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${adminId}, 'Test', 'Flow Admin Car', ${`FLOW-A-${suffix}`}, 'passenger')
    RETURNING id
  `
  adminCarId = adminCar.id
})

afterAll(async () => {
  await sql`DELETE FROM bookings WHERE booking_date = ${testDate} AND (user_id = ${customerId} OR user_id = ${adminId})`
  await sql`DELETE FROM blocked_slots WHERE booking_date = ${testDate} AND created_by = ${adminId}`
  await sql`DELETE FROM holidays WHERE date IN (${testDate}, ${holidayDate})`
  await sql`DELETE FROM cars WHERE id IN (${customerCarId}, ${adminCarId})`
  await sql`DELETE FROM users WHERE id IN (${customerId}, ${adminId})`
  await sql.end()
})

describe('end-to-end booking flow', () => {
  it('customer books, slot becomes booked, customer cancellation frees it, and it can be booked again', async () => {
    const first = await createBooking({
      userId: customerId,
      carId: customerCarId,
      bookingDate: testDate,
      bookingTime: slot,
    })

    expect(first.price_cents).toBe(3000)
    expect(first.status).toBe('confirmed')

    const customerView = await getSlotAvailability(testDate, 'customer')
    const customerSlot = customerView.find((item) => item.time === slot)
    expect(customerSlot?.state).toBe('booked')
    expect(customerSlot?.available).toBe(false)
    expect(customerSlot?.bookingId).toBeNull()

    const adminView = await getSlotAvailability(testDate, 'admin')
    expect(adminView.find((item) => item.time === slot)?.bookingId).toBe(first.id)

    await sql`UPDATE bookings SET status = 'cancelled_customer', updated_at = now() WHERE id = ${first.id}`

    const afterCancel = await getSlotAvailability(testDate, 'customer')
    expect(afterCancel.find((item) => item.time === slot)?.state).toBe('available')

    const second = await createBooking({
      userId: customerId,
      carId: customerCarId,
      bookingDate: testDate,
      bookingTime: slot,
    })
    expect(second.id).not.toBe(first.id)
    expect(second.status).toBe('confirmed')
  })

  it('rejects a blocked slot and an active holiday for customers', async () => {
    await sql`UPDATE bookings SET status = 'cancelled_customer' WHERE booking_date = ${testDate} AND user_id = ${customerId}`
    await sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${testDate}, '16:00', 'Flow test blocked slot', ${adminId})
    `

    await expect(createBooking({
      userId: customerId,
      carId: customerCarId,
      bookingDate: testDate,
      bookingTime: '16:00',
    })).rejects.toMatchObject({ statusMessage: 'SLOT_BLOCKED' })

    await sql`
      INSERT INTO holidays (date, name, active)
      VALUES (${holidayDate}, 'Flow Test Holiday', TRUE)
    `

    await expect(createBooking({
      userId: customerId,
      carId: customerCarId,
      bookingDate: holidayDate,
      bookingTime: '15:00',
    })).rejects.toMatchObject({ statusMessage: 'HOLIDAY' })
  })

  it('rejects banned customers and allows the same booking engine to be used by admin', async () => {
    await sql`UPDATE users SET banned = TRUE, ban_reason = 'Integration test' WHERE id = ${customerId}`

    await expect(createBooking({
      userId: customerId,
      carId: customerCarId,
      bookingDate: testDate,
      bookingTime: '17:00',
    })).rejects.toMatchObject({ statusCode: 403, statusMessage: 'CLIENT_BANNED' })

    await sql`UPDATE users SET banned = FALSE, ban_reason = NULL WHERE id = ${customerId}`

    const adminBooking = await createBooking({
      userId: adminId,
      carId: adminCarId,
      bookingDate: testDate,
      bookingTime: '17:00',
      isAdmin: true,
    })
    expect(adminBooking.price_cents).toBe(2500)
    expect(adminBooking.status).toBe('confirmed')

    await sql`UPDATE bookings SET status = 'cancelled_admin', updated_at = now() WHERE id = ${adminBooking.id}`
    const freed = await getSlotAvailability(testDate, 'admin')
    expect(freed.find((item) => item.time === '17:00')?.state).toBe('available')
  })

  it('prevents a customer from using another customer car', async () => {
    await expect(createBooking({
      userId: customerId,
      carId: adminCarId,
      bookingDate: testDate,
      bookingTime: '18:00',
    })).rejects.toMatchObject({ statusCode: 403, statusMessage: 'CAR_NOT_OWNED' })
  })
})
