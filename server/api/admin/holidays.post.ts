import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { writeAuditLog } from '../../utils/audit'
import { getDb } from '../../utils/db'
import { isValidIsoDate } from '../../domain/booking/dates'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(150),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = schema.parse(await readBody(event))

  if (!isValidIsoDate(body.date)) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_DATE', data: { code: 'INVALID_DATE' } })
  }

  const db = getDb()
  return db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${body.date}`}))`

    const activeBookings = await tx`
      SELECT id FROM bookings
      WHERE booking_date = ${body.date}
        AND status IN ('pending', 'confirmed')
      LIMIT 1
    `
    if (activeBookings.length) {
      throw createError({
        statusCode: 409,
        statusMessage: 'ACTIVE_BOOKING_EXISTS',
        data: { code: 'ACTIVE_BOOKING_EXISTS' },
      })
    }

    try {
      const rows = await tx`
        INSERT INTO holidays (date, name, active)
        VALUES (${body.date}, ${body.name}, TRUE)
        RETURNING *
      `
      await writeAuditLog({
        actorId: admin.id,
        action: 'holiday.created',
        targetId: rows[0].id,
        metadata: rows[0],
      })
      return { holiday: rows[0] }
    } catch (error: any) {
      if (error?.code === '23505') {
        throw createError({ statusCode: 409, statusMessage: 'HOLIDAY_ALREADY_EXISTS', data: { code: 'HOLIDAY_ALREADY_EXISTS' } })
      }
      throw error
    }
  })
})
