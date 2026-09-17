import { requireAdmin } from '../../../utils/authorization'
import { writeAuditLog } from '../../../utils/audit'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'BLOCKED_SLOT_NOT_FOUND', data: { code: 'BLOCKED_SLOT_NOT_FOUND' } })
  const db = getDb()

  return db.begin(async (tx) => {
    const rows = await tx`
      SELECT id, booking_date, booking_time FROM blocked_slots WHERE id = ${id} FOR UPDATE
    `
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'BLOCKED_SLOT_NOT_FOUND', data: { code: 'BLOCKED_SLOT_NOT_FOUND' } })

    const block = rows[0]
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${String(block.booking_date).slice(0, 10)}`}))`

    const deleted = await tx`
      DELETE FROM blocked_slots WHERE id = ${id} RETURNING id, booking_date, booking_time
    `
    if (!deleted.length) throw createError({ statusCode: 404, statusMessage: 'BLOCKED_SLOT_NOT_FOUND', data: { code: 'BLOCKED_SLOT_NOT_FOUND' } })

    await writeAuditLog({ actorId: admin.id, action: 'blocked_slot.deleted', targetId: id, metadata: deleted[0] })
    return { deleted: true, id }
  })
})
