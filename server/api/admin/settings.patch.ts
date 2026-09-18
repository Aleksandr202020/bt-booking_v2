import { createError } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { getDb } from '../../utils/db'
import { writeAuditLog } from '../../utils/audit'

const schema = z.object({
  key: z.enum(['max_customer_bookings_in_window','max_customer_bookings_per_car_in_window']),
  value: z.number().int().min(1).max(30),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'INVALID_SETTING_REQUEST', data: { code: 'INVALID_SETTING_REQUEST' } })
  const body = parsed.data
  const db = getDb()
  return db.begin(async (tx) => {
    const rows = await tx`UPDATE app_settings SET value = ${JSON.stringify(body.value)}::jsonb, updated_at = now() WHERE key = ${body.key} RETURNING key, value`
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'SETTING_NOT_FOUND' })
    await writeAuditLog({ actorId: admin.id, action: 'setting.updated', metadata: { key: body.key, value: body.value } }, tx)
    return { setting: rows[0] }
  })
})
