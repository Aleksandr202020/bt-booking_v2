import { getRequestIP } from 'h3'
import { z } from 'zod'
import { verifyPassword } from '../../domain/auth/auth'
import { getDb } from '../../utils/db'
import { enforceLoginRateLimit, resetLoginRateLimit } from '../../utils/rate-limit'
import { createSession } from '../../utils/session'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
})

export default defineEventHandler(async (event) => {
  const body = loginSchema.parse(await readBody(event))
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const rateLimitKeys = [`login:email:${body.email}`, `login:ip:${ip}`]

  await enforceLoginRateLimit(rateLimitKeys)

  const db = getDb()
  const rows = await db`
    SELECT id, name, email, phone, password_hash, role, banned, ban_reason, banned_at, created_at
    FROM users
    WHERE email = ${body.email}
    LIMIT 1
  `
  const user = rows[0]

  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    throw createError({ statusCode: 401, statusMessage: 'INVALID_CREDENTIALS', data: { code: 'INVALID_CREDENTIALS' } })
  }

  await resetLoginRateLimit(rateLimitKeys)
  await createSession(event, user.id)
  const { password_hash: _passwordHash, ...safeUser } = user
  return { user: safeUser }
})
