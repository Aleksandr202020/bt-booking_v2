import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'
import { updateBooking } from '../server/domain/booking/update-booking'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for admin booking integration tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = Date.now().toString() + '-' + Math.random().toString(36).slice(2)

let customerId: string
let adminId: string
let customerPassengerCarId: string
let customerCrossoverCarId: string
let adminCarId: string

function addDaysIso(days: number) {
  const date = new Date()
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const testDate = addDaysIso(3)
const holidayDate = addDaysIso(4)

beforeAll(async () => {
  const customerEmail = 'admin-flow-customer-' + suffix + '@example.test'
  const adminEmail = 'admin-flow-admin-' + suffix + '@example.test'
  const passengerRegistration = 'AF-P-' + suffix
  const crossoverRegistration = 'AF-C-' + suffix
  const adminRegistration = 'AF-A-' + suffix

  const [customer] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Admin Flow Customer', ${customerEmail}, '+37100000001', 'test-only-hash', 'customer')
    RETURNING id
  `
  customerId = customer.id

  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Admin Flow Admin', ${adminEmail}, '+37100000002', 'test-only-hash', 'admin')
    RETURNING id
  `
  adminId = admin.id

  const [passenger] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Test', 'Passenger', ${passengerRegistration}, 'passenger')
    RETURNING id
  `
  customerPassengerCarId = passenger.id

  const [crossover] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Skoda', 'Kamiq', ${crossoverRegistration}, 'crossover')
    RETURNING id
  `
  customerCrossoverCarId = crossover.id

  const [adminCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${adminId}, 'Test', 'Admin Vehicle', ${adminRegistration}, 'passenger')
    RETURNING id
  `
  adminCarId = adminCar.id
})

afterEach(async () => {
  await sql`DELETE FROM bookings WHERE user_id IN (${customerId}, ${adminId})`
  await sql`DELETE FROM blocked_slots WHERE created_by = ${adminId}`
  await sql`DELETE FROM holidays WHERE date IN (${testDate}, ${holidayDate})`
  await sql`
    UPDATE users
    SET banned = FALSE, ban_reason = NULL, banned_at = NULL, updated_at = now()
    WHERE id = ${customerId}
  `
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE actor_id IN (${customerId}, ${adminId}) OR target_id IN (${customerId}, ${adminId})`
  await sql`DELETE FROM blocked_slots WHERE created_by = ${adminId}`
  await sql`DELETE FROM holidays WHERE date IN (${testDate}, ${holidayDate})`
  await sql`DELETE FROM bookings WHERE user_id IN (${customerId}, ${adminId})`
  await sql`DELETE FROM cars WHERE user_id IN (${customerId}, ${adminId})`
  await sql`DELETE FROM users WHERE id IN (${customerId}, ${adminId})`
  await sql.end()
})

describe('admin booking flow integration', () => {
  it('admin can create a booking beyond the customer booking window and price is server-side', async () => {
    const booking = await createBooking({
      userId: adminId,
      carId: adminCarId,
      bookingDate: '2099-12-20',
      bookingTime: '09:00',
      isAdmin: true,
      notes: 'manual admin booking',
    })

    expect(booking.price_cents).toBe(2500)
    expect(booking.status).toBe('confirmed')
  })

  it('admin update changes car/date/time and recalculates the price', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '15:00',
    })

    const updated = await updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerCrossoverCarId,
      bookingDate: testDate,
      bookingTime: '16:00',
      status: 'confirmed',
      notes: 'changed by admin',
    })

    expect(updated.car_id).toBe(customerCrossoverCarId)
    expect(String(updated.booking_time).slice(0, 5)).toBe('16:00')
    expect(updated.price_cents).toBe(3000)
    expect(updated.notes).toBe('changed by admin')
  })

  it('admin update cannot move an active booking onto a blocked slot or holiday', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '17:00',
    })

    await sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${testDate}, '18:00', 'integration test block', ${adminId})
    `
    await sql`
      INSERT INTO holidays (date, name, active)
      VALUES (${holidayDate}, 'Integration Test Holiday', TRUE)
    `

    await expect(updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '18:00',
      status: 'confirmed',
    })).rejects.toMatchObject({ data: { code: 'SLOT_BLOCKED' } })

    await expect(updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: holidayDate,
      bookingTime: '10:00',
      status: 'confirmed',
    })).rejects.toMatchObject({ data: { code: 'HOLIDAY' } })
  })

  it('banned customer cannot keep an active booking after an admin edit', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '19:00',
    })

    await sql`
      UPDATE users
      SET banned = TRUE, ban_reason = 'integration test', banned_at = now(), updated_at = now()
      WHERE id = ${customerId}
    `

    await expect(updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '20:00',
      status: 'confirmed',
    })).rejects.toMatchObject({ data: { code: 'CLIENT_BANNED' } })
  })

  it('completed/cancelled/no-show history does not reserve a slot', async () => {
    const statuses = ['completed', 'cancelled_admin', 'no_show'] as const

    for (let index = 0; index < statuses.length; index += 1) {
      const status = statuses[index]
      const time = String(9 + index).padStart(2, '0') + ':00'

      const [row] = await sql`
        INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
        VALUES (${customerId}, ${customerPassengerCarId}, ${testDate}, ${time}, 2500, ${status})
        RETURNING id
      `

      const replacement = await createBooking({
        userId: customerId,
        carId: customerPassengerCarId,
        bookingDate: testDate,
        bookingTime: time,
      })

      expect(replacement.price_cents).toBe(2500)
      await sql`DELETE FROM bookings WHERE id IN (${row.id}, ${replacement.id})`
    }
  })
})
