import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from '../server/domain/booking/create-booking'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for booking-ban race tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const email = `booking-ban-${suffix}@example.test`
let userId: string
let carId: string

type BookingBanOutcome = 'booking-created' | 'booking-rejected' | 'ban-created'

beforeAll(async () => {
  const [user] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Booking Ban Race Customer', ${email}, '+37100000003', 'test-only-hash', 'customer')
    RETURNING id
  `
  userId = user.id

  const [car] = await sql`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${userId}, 'Test', 'Ban Race Vehicle', ${`BB-${suffix}`}, 'passenger')
    RETURNING id
  `
  carId = car.id
})

afterAll(async () => {
  await sql`DELETE FROM audit_logs WHERE actor_id = ${userId} OR target_id = ${userId}`
  await sql`DELETE FROM bookings WHERE user_id = ${userId}`
  await sql`DELETE FROM cars WHERE user_id = ${userId}`
  await sql`DELETE FROM users WHERE id = ${userId}`
  await sql.end()
})

describe('booking ↔ ban concurrency', () => {
  it('serializes booking creation against a concurrent customer ban', async () => {
    const bookingDate = '2099-12-26'
    const bookingTime = '17:00'

    await sql`
      UPDATE users
      SET banned = FALSE, ban_reason = NULL, banned_at = NULL, updated_at = now()
      WHERE id = ${userId}
    `

    const attemptBan = async (): Promise<BookingBanOutcome> => sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${userId}`}))`
      await tx`
        UPDATE users
        SET banned = TRUE, ban_reason = 'concurrency test', banned_at = now(), updated_at = now()
        WHERE id = ${userId}
      `
      return 'ban-created'
    })

    const results = await Promise.allSettled([
      createBooking({
        userId,
        carId,
        bookingDate,
        bookingTime,
      }).then(() => 'booking-created' as const).catch((error) => {
        if (error?.data?.code === 'CLIENT_BANNED') return 'booking-rejected' as const
        throw error
      }),
      attemptBan(),
    ])

    const fulfilled = results
      .filter((result): result is PromiseFulfilledResult<BookingBanOutcome> => result.status === 'fulfilled')
      .map((result) => result.value)
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(rejected).toHaveLength(0)
    const outcomeSet: Set<BookingBanOutcome> = new Set(fulfilled)
    expect(outcomeSet).toEqual(new Set<BookingBanOutcome>([
      'ban-created',
      fulfilled.includes('booking-created') ? 'booking-created' : 'booking-rejected',
    ]))

    const [user] = await sql`SELECT banned FROM users WHERE id = ${userId}`
    expect(user.banned).toBe(true)

    const bookings = await sql`
      SELECT id FROM bookings
      WHERE user_id = ${userId}
        AND booking_date = ${bookingDate}
        AND booking_time = ${bookingTime}
        AND status IN ('pending', 'confirmed')
    `

    if (fulfilled.includes('booking-created')) {
      expect(bookings).toHaveLength(1)
    } else {
      expect(bookings).toHaveLength(0)
    }

    await sql`DELETE FROM bookings WHERE user_id = ${userId} AND booking_date = ${bookingDate}`
  })
})
