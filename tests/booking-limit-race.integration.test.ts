import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'
import { addCalendarDays, getRigaNowParts } from '../server/domain/booking/dates'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for booking limit race tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
let customerId: string
let passengerCarId: string
let secondPassengerCarId: string

beforeAll(async () => {
  const [customer] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Booking Limit Race Customer', ${`booking-limit-${suffix}@example.test`}, '+37100000031', 'test-only-hash', 'customer')
    RETURNING id
  `
  customerId = customer.id

  const [firstCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Test', 'Limit Vehicle A', ${`BL-A-${suffix}`}, 'passenger')
    RETURNING id
  `
  passengerCarId = firstCar.id

  const [secondCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Test', 'Limit Vehicle B', ${`BL-B-${suffix}`}, 'passenger')
    RETURNING id
  `
  secondPassengerCarId = secondCar.id
})

afterAll(async () => {
  await sql`DELETE FROM bookings WHERE user_id = ${customerId}`
  await sql`DELETE FROM cars WHERE user_id = ${customerId}`
  await sql`DELETE FROM users WHERE id = ${customerId}`
  await sql.end()
})

function futureDate(days: number) {
  return addCalendarDays(getRigaNowParts().date, days)
}

describe('booking limit race integration', () => {
  it('serializes concurrent bookings so the total active-booking limit cannot be bypassed', async () => {
    const existingDateA = futureDate(5)
    const existingDateB = futureDate(6)
    const raceDateA = futureDate(7)
    const raceDateB = futureDate(8)

    await sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
      VALUES
        (${customerId}, ${passengerCarId}, ${existingDateA}, '09:00', 2500, 'confirmed'),
        (${customerId}, ${secondPassengerCarId}, ${existingDateB}, '10:00', 2500, 'confirmed')
    `

    const results = await Promise.allSettled([
      createBooking({
        userId: customerId,
        carId: passengerCarId,
        bookingDate: raceDateA,
        bookingTime: '11:00',
      }),
      createBooking({
        userId: customerId,
        carId: secondPassengerCarId,
        bookingDate: raceDateB,
        bookingTime: '12:00',
      }),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ reason: { data: { code: 'BOOKING_LIMIT_REACHED' } } })

    const activeRows = await sql`
      SELECT id FROM bookings
      WHERE user_id = ${customerId}
        AND status IN ('pending', 'confirmed')
    `
    expect(activeRows).toHaveLength(3)
  })

  it('serializes concurrent bookings so the per-car active-booking limit cannot be bypassed', async () => {
    const existingDate = futureDate(10)
    const raceDateA = futureDate(11)
    const raceDateB = futureDate(12)

    await sql`
      INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
      VALUES (${customerId}, ${passengerCarId}, ${existingDate}, '13:00', 2500, 'confirmed')
    `

    const results = await Promise.allSettled([
      createBooking({
        userId: customerId,
        carId: passengerCarId,
        bookingDate: raceDateA,
        bookingTime: '14:00',
      }),
      createBooking({
        userId: customerId,
        carId: passengerCarId,
        bookingDate: raceDateB,
        bookingTime: '15:00',
      }),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ reason: { data: { code: 'CAR_BOOKING_LIMIT_REACHED' } } })

    const activeRows = await sql`
      SELECT id FROM bookings
      WHERE user_id = ${customerId}
        AND car_id = ${passengerCarId}
        AND status IN ('pending', 'confirmed')
    `
    expect(activeRows).toHaveLength(2)
  })
})
