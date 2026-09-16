import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { getDb } from '../../utils/db'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(150),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = schema.parse(await readBody(event))
  const db = getDb()
  try {
    const rows = await db`
      INSERT INTO holidays (date, name, active)
      VALUES (${body.date}, ${body.name}, TRUE)
      RETURNING *
    `
    return { holiday: rows[0] }
  } catch (error: any) {
    if (error?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'HOLIDAY_ALREADY_EXISTS', data: { code: 'HOLIDAY_ALREADY_EXISTS' } })
    }
    throw error
  }
})
