import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { getDb } from '../../utils/db'

const schema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingTime: z.string().regex(/^\d{2}:00$/).nullable().optional(),
  reason: z.string().trim().min(1).max(300),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = schema.parse(await readBody(event))
  const db = getDb()

  try {
    const rows = await db`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${body.bookingDate}, ${body.bookingTime ?? null}, ${body.reason}, ${admin.id})
      RETURNING *
    `
    return { blockedSlot: rows[0] }
  } catch (error: any) {
    if (error?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'SLOT_ALREADY_BLOCKED', data: { code: 'SLOT_ALREADY_BLOCKED' } })
    }
    throw error
  }
})
