import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'
import { cancelAdminBooking, updateBooking } from '../server/domain/booking/update-booking'

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

  it('active booking update and slot blocking are serialized by the shared date lock', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '13:00',
    })

    const blockResult = sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${testDate}`}))`
      const activeBooking = await tx`
        SELECT 1
        FROM bookings
        WHERE booking_date = ${testDate}
          AND booking_time = '14:00'
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBooking.length) throw new Error('ACTIVE_BOOKING_EXISTS')
      await tx`
        INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
        VALUES (${testDate}, '14:00', 'concurrency integration test', ${adminId})
      `
      return 'blocked' as const
    })

    const updateResult = updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '14:00',
      status: 'confirmed',
    })

    const results = await Promise.allSettled([updateResult, blockResult])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const [targetBooking] = await sql`
      SELECT booking_time FROM bookings WHERE id = ${booking.id}
    `
    const [targetBlock] = await sql`
      SELECT booking_time FROM blocked_slots
      WHERE booking_date = ${testDate} AND booking_time = '14:00' AND created_by = ${adminId}
      LIMIT 1
    `

    if (results[0].status === 'fulfilled') {
      expect(String(targetBooking.booking_time).slice(0, 5)).toBe('14:00')
      expect(targetBlock).toBeUndefined()
    } else {
      expect(String(targetBooking.booking_time).slice(0, 5)).toBe('13:00')
      expect(targetBlock).toBeDefined()
    }
  })

  it('admin update and a competing booking on the old slot are serialized by both calendar dates', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '10:00',
    })

    const oldSlotBooking = sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${testDate}`}))`
      const activeBooking = await tx`
        SELECT 1
        FROM bookings
        WHERE booking_date = ${testDate}
          AND booking_time = '10:00'
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBooking.length) throw new Error('SLOT_UNAVAILABLE')
      await tx`
        INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
        VALUES (${adminId}, ${adminCarId}, ${testDate}, '10:00', 2500, 'confirmed')
      `
      return 'booked-old-slot' as const
    })

    const updateResult = updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '11:00',
      status: 'confirmed',
    })

    const results = await Promise.allSettled([updateResult, oldSlotBooking])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const [targetBooking] = await sql`
      SELECT booking_time, status
      FROM bookings
      WHERE id = ${booking.id}
    `
    const oldSlotBookings = await sql`
      SELECT id
      FROM bookings
      WHERE booking_date = ${testDate}
        AND booking_time = '10:00'
        AND status IN ('pending', 'confirmed')
    `

    if (results[0].status === 'fulfilled') {
      expect(String(targetBooking.booking_time).slice(0, 5)).toBe('11:00')
      expect(oldSlotBookings).toHaveLength(0)
    } else {
      expect(String(targetBooking.booking_time).slice(0, 5)).toBe('10:00')
      expect(oldSlotBookings).toHaveLength(1)
    }
  })

  it('admin update and a competing block on the old slot are serialized by the shared date lock', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '12:00',
    })

    const blockResult = sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${testDate}`}))`
      const activeBooking = await tx`
        SELECT 1
        FROM bookings
        WHERE booking_date = ${testDate}
          AND booking_time = '12:00'
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBooking.length) throw new Error('ACTIVE_BOOKING_EXISTS')
      await tx`
        INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
        VALUES (${testDate}, '12:00', 'old-slot concurrency block', ${adminId})
      `
      return 'blocked-old-slot' as const
    })

    const updateResult = updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '13:00',
      status: 'confirmed',
    })

    const results = await Promise.allSettled([updateResult, blockResult])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const [targetBooking] = await sql`
      SELECT booking_time FROM bookings WHERE id = ${booking.id}
    `
    const [targetBlock] = await sql`
      SELECT booking_time FROM blocked_slots
      WHERE booking_date = ${testDate} AND booking_time = '12:00' AND created_by = ${adminId}
      LIMIT 1
    `

    if (results[0].status === 'fulfilled') {
      expect(String(targetBooking.booking_time).slice(0, 5)).toBe('13:00')
      expect(targetBlock).toBeUndefined()
    } else {
      expect(String(targetBooking.booking_time).slice(0, 5)).toBe('12:00')
      expect(targetBlock).toBeDefined()
    }
  })

  it('admin update and holiday creation on the target date are serialized by the shared date lock', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '14:00',
    })

    const holidayResult = sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${holidayDate}`}))`
      const activeBooking = await tx`
        SELECT 1
        FROM bookings
        WHERE booking_date = ${holidayDate}
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBooking.length) throw new Error('ACTIVE_BOOKING_EXISTS')
      await tx`
        INSERT INTO holidays (date, name, active)
        VALUES (${holidayDate}, 'Concurrent Integration Holiday', TRUE)
      `
      return 'holiday-created' as const
    })

    const updateResult = updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: holidayDate,
      bookingTime: '10:00',
      status: 'confirmed',
    })

    const results = await Promise.allSettled([updateResult, holidayResult])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const [targetBooking] = await sql`
      SELECT booking_date, booking_time
      FROM bookings
      WHERE id = ${booking.id}
    `
    const [holiday] = await sql`
      SELECT date
      FROM holidays
      WHERE date = ${holidayDate} AND active = TRUE
      LIMIT 1
    `

    if (results[0].status === 'fulfilled') {
      expect(String(targetBooking.booking_date).slice(0, 10)).toBe(holidayDate)
      expect(holiday).toBeUndefined()
    } else {
      expect(String(targetBooking.booking_date).slice(0, 10)).toBe(testDate)
      expect(holiday).toBeDefined()
    }
  })

  it('admin cancellation and a competing booking on the freed slot are serialized by the date lock', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '09:00',
    })

    const competingBooking = sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${testDate}`}))`
      const activeBooking = await tx`
        SELECT 1
        FROM bookings
        WHERE booking_date = ${testDate}
          AND booking_time = '09:00'
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBooking.length) throw new Error('SLOT_UNAVAILABLE')
      await tx`
        INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
        VALUES (${adminId}, ${adminCarId}, ${testDate}, '09:00', 2500, 'confirmed')
      `
      return 'booked-freed-slot' as const
    })

    const cancellation = cancelAdminBooking(booking.id)
    const results = await Promise.allSettled([cancellation, competingBooking])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2)

    const activeBookings = await sql`
      SELECT id, user_id
      FROM bookings
      WHERE booking_date = ${testDate}
        AND booking_time = '09:00'
        AND status IN ('pending', 'confirmed')
    `
    const [original] = await sql`
      SELECT status FROM bookings WHERE id = ${booking.id}
    `

    expect(original.status).toBe('cancelled_admin')
    expect(activeBookings).toHaveLength(1)
    expect(activeBookings[0].user_id).toBe(adminId)
  })

  it('admin cancellation and a competing block on the freed slot are serialized by the date lock', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '08:00',
    }).catch(() => null)

    // 08:00 is intentionally not a working slot, so the setup above must fail.
    // Recreate the fixture at a valid slot after proving invalid setup is rejected.
    expect(booking).toBeNull()

    const validBooking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '18:00',
    })

    const blockResult = sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${testDate}`}))`
      const activeBooking = await tx`
        SELECT 1
        FROM bookings
        WHERE booking_date = ${testDate}
          AND booking_time = '18:00'
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBooking.length) throw new Error('ACTIVE_BOOKING_EXISTS')
      await tx`
        INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
        VALUES (${testDate}, '18:00', 'freed-slot concurrency block', ${adminId})
      `
      return 'blocked-freed-slot' as const
    })

    const cancellation = cancelAdminBooking(validBooking.id)
    const results = await Promise.allSettled([cancellation, blockResult])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2)

    const [original] = await sql`
      SELECT status FROM bookings WHERE id = ${validBooking.id}
    `
    const [block] = await sql`
      SELECT booking_time
      FROM blocked_slots
      WHERE booking_date = ${testDate} AND booking_time = '18:00' AND created_by = ${adminId}
      LIMIT 1
    `

    expect(original.status).toBe('cancelled_admin')
    expect(block).toBeDefined()
  })

  it('admin cancellation reloads the booking state atomically instead of using stale data', async () => {
    const booking = await createBooking({
      userId: customerId,
      carId: customerPassengerCarId,
      bookingDate: testDate,
      bookingTime: '11:00',
    })

    const [staleSnapshot] = await sql`
      SELECT id, user_id, car_id, booking_date, booking_time, notes
      FROM bookings
      WHERE id = ${booking.id}
    `

    await updateBooking({
      bookingId: booking.id,
      userId: customerId,
      carId: customerCrossoverCarId,
      bookingDate: testDate,
      bookingTime: '12:00',
      status: 'confirmed',
      notes: 'moved before cancellation',
    })

    expect(String(staleSnapshot.booking_time).slice(0, 5)).toBe('11:00')

    const cancelled = await cancelAdminBooking(booking.id)

    expect(cancelled.status).toBe('cancelled_admin')
    expect(String(cancelled.booking_time).slice(0, 5)).toBe('12:00')
    expect(cancelled.car_id).toBe(customerCrossoverCarId)
    expect(cancelled.notes).toBe('moved before cancellation')
  })
})
