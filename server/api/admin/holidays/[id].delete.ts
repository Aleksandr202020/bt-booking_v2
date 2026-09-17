import { requireAdmin } from '../../../utils/authorization'
import { writeAuditLog } from '../../../utils/audit'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'HOLIDAY_NOT_FOUND', data: { code: 'HOLIDAY_NOT_FOUND' } })
  const db = getDb()

  return db.begin(async (tx) => {
    const rows = await tx`
      SELECT id, date, name FROM holidays WHERE id = ${id} FOR UPDATE
    `
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'HOLIDAY_NOT_FOUND', data: { code: 'HOLIDAY_NOT_FOUND' } })

    const holiday = rows[0]
    const date = String(holiday.date).slice(0, 10)
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${date}`}))`

    const deleted = await tx`
      DELETE FROM holidays WHERE id = ${id} RETURNING id, date, name
    `
    if (!deleted.length) throw createError({ statusCode: 404, statusMessage: 'HOLIDAY_NOT_FOUND', data: { code: 'HOLIDAY_NOT_FOUND' } })

    await writeAuditLog({ actorId: admin.id, action: 'holiday.deleted', targetId: id, metadata: deleted[0] })
    return { deleted: true, id }
  })
})
