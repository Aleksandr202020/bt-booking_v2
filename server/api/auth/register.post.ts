import { createError } from 'h3'
import { z } from 'zod'
import { hashPassword } from '../../domain/auth/auth'
import { getDb } from '../../utils/db'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, hashSessionToken } from '../../domain/auth/auth'
import { setCookie } from 'h3'

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().min(5).max(30),
  password: z.string().min(8).max(128),
})

export default defineEventHandler(async (event) => {
  const parsed = registerSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_REGISTER_REQUEST', data: { code: 'INVALID_REGISTER_REQUEST' } })
  }
  const body = parsed.data
  const db = getDb()
  const passwordHash = await hashPassword(body.password)

  try {
    const result = await db.begin(async (tx) => {
      const rows = await tx`
        INSERT INTO users (name, email, phone, password_hash)
        VALUES (${body.name}, ${body.email}, ${body.phone}, ${passwordHash})
        RETURNING id, name, email, phone, role, banned, created_at
      `
      const user = rows[0]
      const token = createSessionToken()
      const tokenHash = hashSessionToken(token)
      await tx`
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES (${user.id}, ${tokenHash}, now() + (${SESSION_TTL_SECONDS} * interval '1 second'))
      `
      return { user, token }
    })

    setCookie(event, SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    })
    return { user: result.user }
  } catch (error: any) {
    if (error?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'EMAIL_ALREADY_EXISTS', data: { code: 'EMAIL_ALREADY_EXISTS' } })
    }
    throw error
  }
})
