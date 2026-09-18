import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { enforceLoginRateLimit, resetLoginRateLimit } from '../server/utils/rate-limit'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for rate-limit integration tests')

const sql = postgres(databaseUrl, { prepare: false })
const key = `rate-limit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

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
    expect(Number(row.attempts)).toBe(20)
  })
})

afterAll(async () => {
  await sql`DELETE FROM login_rate_limits WHERE key = ${key}`
  await sql.end()
})
