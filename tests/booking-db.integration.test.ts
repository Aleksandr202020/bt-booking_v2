import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) throw new Error('DATABASE_URL is required for booking DB integration tests')

const sql = postgres(databaseUrl, { prepare: false })

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const email = `booking-test-${suffix}@example.test`
let userId: string
let carId: string

beforeAll(async () => {
  const [user] = await sql`
    INSERT INTO users (name, email, phone, password_hash)
    VALUES ('Booking Integration Test', ${email}, '+37100000000', 'test-only-hash')
    RETURNING id
  `
  userId = user.id

  const [car] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${userId}, 'Test', 'Vehicle', ${`TEST-${suffix}`}, 'passenger')
    RETURNING id
  `
  carId = car.id
})

afterAll(async () => {
  if (userId) {
    await sql`DELETE FROM blocked_slots WHERE created_by = ${userId}`
    await sql`DELETE FROM bookings WHERE user_id = ${userId}`
    await sql`DELETE FROM cars WHERE user_id = ${userId}`
    await sql`DELETE FROM users WHERE id = ${userId}`
  }
  await sql.end()
})

describe('PostgreSQL booking integrity', () => {
  it('has a partial unique index allowing only one active booking per slot', async () => {
    const rows = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'bookings'
        AND indexname = 'bookings_one_active_slot_idx'
    `

    expect(rows).toHaveLength(1)
    const indexDef = String(rows[0].indexdef)
    expect(indexDef).toContain('UNIQUE')
    expect(indexDef).toContain('booking_date')
    expect(indexDef).toContain('booking_time')
    expect(indexDef).toContain('pending')
    expect(indexDef).toContain('confirmed')
  })

  it('allows one concurrent reservation and rejects the conflicting reservation', async () => {
    const bookingDate = '2099-12-31'
    const bookingTime = '13:00'

    const attempt = async () => {
      try {
        const [booking] = await sql`
          INSERT INTO bookings (
            user_id, car_id, booking_date, booking_time, price_cents, status
          )
          VALUES (
            ${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'confirmed'
          )
          RETURNING id
        `
        return { ok: true as const, id: booking.id }
      } catch (error: any) {
        return {
          ok: false as const,
          code: error?.code,
          detail: error?.detail,
          message: error?.message,
        }
      }
    }

    const results = await Promise.all([attempt(), attempt()])
    const successful = results.filter((result) => result.ok)
    const rejected = results.filter((result) => !result.ok)

    expect(successful).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].code).toBe('23505')
    expect(rejected[0].detail ?? rejected[0].message).toContain('Key (booking_date, booking_time)')
    expect(rejected[0].detail ?? rejected[0].message).toContain(`${bookingDate}, ${bookingTime}:00`)

    const rows = await sql`
      SELECT id, status
      FROM bookings
      WHERE booking_date = ${bookingDate}
        AND booking_time = ${bookingTime}
        AND status IN ('pending', 'confirmed')
    `
    expect(rows).toHaveLength(1)

    await sql`
      DELETE FROM bookings
      WHERE booking_date = ${bookingDate} AND booking_time = ${bookingTime}
    `
  })

  it('allows a cancelled booking to be replaced in the same slot', async () => {
    const bookingDate = '2099-12-30'
    const bookingTime = '14:00'

    const [first] = await sql`
      INSERT INTO bookings (
        user_id, car_id, booking_date, booking_time, price_cents, status
      )
      VALUES (${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'confirmed')
      RETURNING id
    `

    await sql`UPDATE bookings SET status = 'cancelled_customer' WHERE id = ${first.id}`

    const [second] = await sql`
      INSERT INTO bookings (
        user_id, car_id, booking_date, booking_time, price_cents, status
      )
      VALUES (${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'confirmed')
      RETURNING id
    `

    expect(second.id).toBeTruthy()

    await sql`DELETE FROM bookings WHERE id IN (${first.id}, ${second.id})`
  })

  it('serializes a booking against a concurrent slot block', async () => {
    const bookingDate = '2099-12-29'
    const bookingTime = '15:00'

    const attemptBooking = async () => {
      return sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`
        const blocked = await tx`
          SELECT id FROM blocked_slots
          WHERE booking_date = ${bookingDate}
            AND (booking_time = ${bookingTime} OR booking_time IS NULL)
          LIMIT 1
        `
        if (blocked.length) return 'booking-rejected'
        await tx`
          INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
          VALUES (${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'confirmed')
        `
        return 'booking-created'
      })
    }

    const attemptBlock = async () => {
      return sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`
        const active = await tx`
          SELECT id FROM bookings
          WHERE booking_date = ${bookingDate}
            AND booking_time = ${bookingTime}
            AND status IN ('pending', 'confirmed')
          LIMIT 1
        `
        if (active.length) return 'block-rejected'
        await tx`
          INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
          VALUES (${bookingDate}, ${bookingTime}, 'concurrency test', ${userId})
        `
        return 'block-created'
      })
    }

    const results = await Promise.all([attemptBooking(), attemptBlock()])
    expect(results.sort()).toEqual(['block-created', 'booking-rejected'])

    const bookings = await sql`
      SELECT id FROM bookings
      WHERE booking_date = ${bookingDate} AND booking_time = ${bookingTime}
        AND status IN ('pending', 'confirmed')
    `
    const blocks = await sql`
      SELECT id FROM blocked_slots
      WHERE booking_date = ${bookingDate} AND booking_time = ${bookingTime}
    `
    expect(bookings).toHaveLength(0)
    expect(blocks).toHaveLength(1)

    await sql`DELETE FROM blocked_slots WHERE booking_date = ${bookingDate} AND booking_time = ${bookingTime}`
  })

  it('serializes a booking against a concurrent holiday creation', async () => {
    const bookingDate = '2099-12-28'
    const bookingTime = '16:00'

    const attemptBooking = async () => {
      return sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`
        const holiday = await tx`SELECT id FROM holidays WHERE date = ${bookingDate} AND active = TRUE LIMIT 1`
        if (holiday.length) return 'booking-rejected'
        await tx`
          INSERT INTO bookings (user_id, car_id, booking_date, booking_time, price_cents, status)
          VALUES (${userId}, ${carId}, ${bookingDate}, ${bookingTime}, 2500, 'confirmed')
        `
        return 'booking-created'
      })
    }

    const attemptHoliday = async () => {
      return sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`
        const active = await tx`
          SELECT id FROM bookings
          WHERE booking_date = ${bookingDate}
            AND status IN ('pending', 'confirmed')
          LIMIT 1
        `
        if (active.length) return 'holiday-rejected'
        await tx`
          INSERT INTO holidays (date, name, active)
          VALUES (${bookingDate}, 'Concurrency test', TRUE)
        `
        return 'holiday-created'
      })
    }

    const results = await Promise.all([attemptBooking(), attemptHoliday()])
    expect(results.sort()).toEqual(['booking-created', 'holiday-rejected'])

    const bookings = await sql`
      SELECT id FROM bookings
      WHERE booking_date = ${bookingDate} AND status IN ('pending', 'confirmed')
    `
    const holidays = await sql`
      SELECT id FROM holidays WHERE date = ${bookingDate} AND active = TRUE
    `
    expect(bookings).toHaveLength(1)
    expect(holidays).toHaveLength(0)

    await sql`DELETE FROM bookings WHERE booking_date = ${bookingDate}`
    await sql`DELETE FROM holidays WHERE date = ${bookingDate}`
  })
})
