import { createError } from 'h3'
import { type TransactionSql } from 'postgres'
import { getDb } from './db'

const LOGIN_WINDOW_SECONDS = 15 * 60
const LOGIN_MAX_ATTEMPTS = 10

async function withRateLimitLock<T>(
  key: string,
  fn: (tx: TransactionSql) => Promise<T>,
) {
  const db = getDb()
  return db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`login-rate:${key}`}))`
    return fn(tx)
  })
}

export async function enforceLoginRateLimit(keys: string[]) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))]

  for (const key of uniqueKeys) {
    const rows = await withRateLimitLock(key, async (tx) => tx`
        INSERT INTO login_rate_limits (key, window_started_at, attempts)
        VALUES (${key}, now(), 1)
        ON CONFLICT (key) DO UPDATE
        SET
          window_started_at = CASE
            WHEN login_rate_limits.window_started_at <= now() - (${LOGIN_WINDOW_SECONDS} * interval '1 second')
              THEN now()
            ELSE login_rate_limits.window_started_at
          END,
          attempts = CASE
            WHEN login_rate_limits.window_started_at <= now() - (${LOGIN_WINDOW_SECONDS} * interval '1 second')
              THEN 1
            ELSE login_rate_limits.attempts + 1
          END
        RETURNING attempts
      `)

    if (Number(rows[0]?.attempts ?? 0) > LOGIN_MAX_ATTEMPTS) {
      throw createError({
        statusCode: 429,
        statusMessage: 'RATE_LIMITED',
        data: { code: 'RATE_LIMITED', retryAfterSeconds: LOGIN_WINDOW_SECONDS },
      })
    }
  }
}

export async function resetLoginRateLimit(keys: string[]) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))]
  if (!uniqueKeys.length) return
  for (const key of uniqueKeys) {
    await withRateLimitLock(key, async (tx) => {
      await tx`DELETE FROM login_rate_limits WHERE key = ${key}`
    })
  }
}