import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { enforceLoginRateLimit, resetLoginRateLimit } from '../server/utils/rate-limit'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for rate-limit integration tests')

const sql = postgres(databaseUrl, { prepare: false })
const key = `rate-limit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
const secondaryKey = `${key}-secondary`

describe('login rate limiting', () => {
  it('allows ten attempts and rejects the eleventh within the window', async () => {
    for (let i = 0; i < 10; i += 1) {
      await expect(enforceLoginRateLimit([key])).resolves.toBeUndefined()
    }

    await expect(enforceLoginRateLimit([key])).rejects.toMatchObject({
      statusCode: 429,
      data: { code: 'RATE_LIMITED' },
    })
  })

  it('resets the rate-limit keys after a successful login', async () => {
    await resetLoginRateLimit([key])
    await enforceLoginRateLimit([key])
    await resetLoginRateLimit([key])
    await expect(enforceLoginRateLimit([key])).resolves.toBeUndefined()
  })

  it('serializes concurrent attempts for the same key at the database boundary', async () => {
    await resetLoginRateLimit([key])

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => enforceLoginRateLimit([key])),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(10)
    expect(results.filter((result) => result.status === 'rejected').every(
      (result) => result.reason?.statusCode === 429 && result.reason?.data?.code === 'RATE_LIMITED',
    )).toBe(true)

    const [row] = await sql`SELECT attempts FROM login_rate_limits WHERE key = ${key}`
    expect(Number(row.attempts)).toBe(10)
  })

  it('locks multiple rate-limit keys in deterministic order', async () => {
    await resetLoginRateLimit([key, secondaryKey])

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        enforceLoginRateLimit(index % 2 === 0 ? [key, secondaryKey] : [secondaryKey, key]),
      ),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(10)
    expect(results.filter((result) => result.status === 'rejected').every(
      (result) => result.reason?.statusCode === 429 && result.reason?.data?.code === 'RATE_LIMITED',
    )).toBe(true)

    const rows = await sql`
      SELECT key, attempts
      FROM login_rate_limits
      WHERE key IN (${key}, ${secondaryKey})
      ORDER BY key
    `
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => Number(row.attempts) === 10)).toBe(true)

    await resetLoginRateLimit([key, secondaryKey])
    const remaining = await sql`
      SELECT key
      FROM login_rate_limits
      WHERE key IN (${key}, ${secondaryKey})
    `
    expect(remaining).toHaveLength(0)
  })
})

afterAll(async () => {
  await sql`DELETE FROM login_rate_limits WHERE key IN (${key}, ${secondaryKey})`
  await sql.end()
})
