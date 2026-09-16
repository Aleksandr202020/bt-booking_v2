import { z } from 'zod'
import { hashPassword } from '../../domain/auth/auth'
import { getDb } from '../../utils/db'
import { createSession } from '../../utils/session'

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().min(5).max(30),
  password: z.string().min(8).max(128),
})

export default defineEventHandler(async (event) => {
  const body = registerSchema.parse(await readBody(event))
  const db = getDb()
  const passwordHash = await hashPassword(body.password)

  try {
    const rows = await db`
      INSERT INTO users (name, email, phone, password_hash)
      VALUES (${body.name}, ${body.email}, ${body.phone}, ${passwordHash})
      RETURNING id, name, email, phone, role, banned, created_at
    `
    const user = rows[0]
    await createSession(event, user.id)
    return { user }
  } catch (error: any) {
    if (error?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'EMAIL_ALREADY_EXISTS', data: { code: 'EMAIL_ALREADY_EXISTS' } })
    }
    throw error
  }
})
