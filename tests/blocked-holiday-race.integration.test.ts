import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for blocked/holiday race tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
let adminId: string

beforeAll(async () => {
  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Date Mutation Test Admin', ${`date-race-admin-${suffix}@example.test`}, '+37100000002', 'test-only-hash', 'admin')
    RETURNING id
  `
  adminId = admin.id
})

afterAll(async () => {
  if (adminId) {
    await sql`DELETE FROM blocked_slots WHERE created_by = ${adminId}`
    await sql`DELETE FROM holidays WHERE name = 'Blocked/Holiday concurrency test'`
    await sql`DELETE FROM users WHERE id = ${adminId}`
  }
  await sql.end()
})

type Outcome = 'holiday-created' | 'holiday-rejected' | 'block-created' | 'block-rejected'

describe('blocked slot and holiday concurrency', () => {
  it('serializes concurrent date mutations so a date cannot become both blocked and a holiday', async () => {
    const bookingDate = '2099-12-27'

    const createHoliday = async (): Promise<Outcome> => sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`

      const block = await tx`
        SELECT id FROM blocked_slots
        WHERE booking_date = ${bookingDate}
        LIMIT 1
      `
      if (block.length) return 'holiday-rejected'

      await tx`
        INSERT INTO holidays (date, name, active)
        VALUES (${bookingDate}, 'Blocked/Holiday concurrency test', TRUE)
      `
      return 'holiday-created'
    })

    const createBlock = async (): Promise<Outcome> => sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`

      const holiday = await tx`
        SELECT id FROM holidays
        WHERE date = ${bookingDate} AND active = TRUE
        LIMIT 1
      `
      if (holiday.length) return 'block-rejected'

      await tx`
        INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
        VALUES (${bookingDate}, '17:00', 'Blocked/Holiday concurrency test', ${adminId})
      `
      return 'block-created'
    })

    const results = await Promise.all([createHoliday(), createBlock()])
    const outcome = new Set(results)

    const valid = [
      ['holiday-created', 'block-rejected'],
      ['holiday-rejected', 'block-created'],
    ]
    expect(valid.some((expected) => expected.length === outcome.size && expected.every((value) => outcome.has(value)))).toBe(true)

    const [counts] = await sql`
      SELECT
        (SELECT count(*)::int FROM holidays WHERE date = ${bookingDate} AND active = TRUE) AS holidays,
        (SELECT count(*)::int FROM blocked_slots WHERE booking_date = ${bookingDate}) AS blocks
    `
    expect(Number(counts.holidays) + Number(counts.blocks)).toBe(1)

    await sql`DELETE FROM blocked_slots WHERE booking_date = ${bookingDate}`
    await sql`DELETE FROM holidays WHERE date = ${bookingDate}`
  })
})
