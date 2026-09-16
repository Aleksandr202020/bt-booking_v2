import { requireAdmin } from '../../../utils/authorization'
import { writeAuditLog } from '../../../utils/audit'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'BLOCKED_SLOT_NOT_FOUND', data: { code: 'BLOCKED_SLOT_NOT_FOUND' } })
  const db = getDb()
  const rows = await db`
    DELETE FROM blocked_slots WHERE id = ${id} RETURNING id, booking_date, booking_time
  `
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'BLOCKED_SLOT_NOT_FOUND', data: { code: 'BLOCKED_SLOT_NOT_FOUND' } })
  await writeAuditLog({ actorId: admin.id, action: 'blocked_slot.deleted', targetId: id, metadata: rows[0] })
  return { deleted: true, id }
})
