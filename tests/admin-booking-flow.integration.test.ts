import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addCalendarDays, getRigaNowParts } from '../server/domain/booking/dates'
import { createBooking } from '../server/domain/booking/create-booking'
import { updateBooking } from '../server/domain/booking/update-booking'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for admin booking integration tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`

let customerId: string
let adminId: string
let customerPassengerCarId: string
let customerCrossoverCarId: string
let adminCarId: string

const tomorrow = addCalendarDays(getRigaNowParts().date, 1)
const dayAfter = addCalendarDays(tomorrow, 1)

beforeAll(async () => {
  const [customer] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Admin Flow Customer', ${`admin-flow-customer-${suffix}@example.test`}, '+37100000001', 'test-only-hash', 'customer')
    RETURNING id
  `
  customerId = customer.id

  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Admin Flow Admin', ${`admin-flow-admin-${suffix}@example.test`}, '+37100000002', 'test-only-hash', 'admin')
    RETURNING id
  `
  adminId = admin.id

  const [passenger] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Test', 'Passenger', ${`AF-P-${suffix}`}, 'passenger')
    RETURNING id
  `
  customerPassengerCarId = passenger.id

  const [crossover] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${customerId}, 'Skoda', 'Kamiq', ${`AF-C-${suffix}`}, 'crossover')
    RETURNING id
  `
  customerCrossoverCarId = crossover.id

  const [adminCar] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${adminId}, 'Test', 'Admin Vehicle', ${`AF-A-${suffix}`}, 'passenger')
    RETURNING id
  `
  adminCarId = adminCar.id
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE actor_id IN (${customerId}, ${adminId}) OR target_id IN (${customerId}, ${adminId})`
  await sql`DELETE FROM blocked_slots WHERE created_by = ${adminId}`
  await sql`DELETE FROM holidays WHERE date IN (${tomorrow}, ${dayAfter})`
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
      bookingDate: tomorrow,
      bookingTime: '15:00',
    })

    const updated = await updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerCrossoverCarId,
      bookingDate: tomorrow,
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
      bookingDate: tomorrow,
      bookingTime: '17:00',
    })

    await sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${tomorrow}, '18:00', 'integration test block', ${adminId})
    `
    await sql`
      INSERT INTO holidays (date, name, active)
      VALUES (${dayAfter}, 'Integration Test Holiday', TRUE)
    `

    await expect(updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: tomorrow,
      bookingTime: '18:00',
      status: 'confirmed',
    })).rejects.toMatchObject({ data: { code: 'SLOT_BLOCKED' } })

    await expect(updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: dayAfter,
      bookingTime: '10:00',
      status: 'confirmed',
    })).rejects.toMatchObject({ data: { code: 'HOLIDAY' } })
  })

  it('banned customer cannot keep an active booking after an admin edit', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: tomorrow,
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
      bookingDate: tomorrow,
      bookingTime: '20:00',
      status: 'confirmed',
    })).rejects.toMatchObject({ data: { code: 'CLIENT_BANNED' } })

    await sql`
      UPDATE users
      SET banned = FALSE, ban_reason = NULL, banned_at = NULL, updated_at = now()
      WHERE id = ${customerId}
    `
  })

  it('completed/cancelled/no-show history does not reserve a slot', async () => {
    const statuses = ['completed', 'cancelled_admin', 'no_show'] as const
    for (const [index, status] of statuses.entries()) {
      const time = `${String(9 + index).padStart(2, '0')}:00`
      const [row] = await sql`
        INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
        VALUES (${customerId}, ${customerPassengerCarId}, ${tomorrow}, ${time}, 2500, ${status})
        RETURNING id
      `
      const replacement = await createBooking({
        userId: customerId,
        carId: customerPassengerCarId,
        bookingDate: tomorrow,
        bookingTime: time,
      })
      expect(replacement.price_cents).toBe(2500)
      await sql`DELETE FROM bookings WHERE id IN (${row.id}, ${replacement.id})`
    }
  })
})
