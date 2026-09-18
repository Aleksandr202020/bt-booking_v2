import { z } from 'zod'
import { requireAdmin } from '../../../utils/authorization'
import { writeAuditLog } from '../../../utils/audit'
import { getDb } from '../../../utils/db'

const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !uuidSchema.safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_BLOCKED_SLOT_ID', data: { code: 'INVALID_BLOCKED_SLOT_ID' } })
  }
  const db = getDb()

  return db.begin(async (tx) => {
    const rows = await tx`
      SELECT id, booking_date, booking_time FROM blocked_slots WHERE id = ${id}
    `
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'BLOCKED_SLOT_NOT_FOUND', data: { code: 'BLOCKED_SLOT_NOT_FOUND' } })

    const block = rows[0]
    const bookingDate = String(block.booking_date).slice(0, 10)
    // Match create/update booking and block operations: date advisory lock first,
    // then row lock, preventing a create/delete deadlock on the same calendar date.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${bookingDate}`}))`

    const lockedRows = await tx`
      SELECT id, booking_date, booking_time FROM blocked_slots WHERE id = ${id} FOR UPDATE
    `
    if (!lockedRows.length) throw createError({ statusCode: 404, statusMessage: 'BLOCKED_SLOT_NOT_FOUND', data: { code: 'BLOCKED_SLOT_NOT_FOUND' } })
    const deleted = await tx`
      DELETE FROM blocked_slots WHERE id = ${id} RETURNING id, booking_date, booking_time
    `
    if (!deleted.length) throw createError({ statusCode: 404, statusMessage: 'BLOCKED_SLOT_NOT_FOUND', data: { code: 'BLOCKED_SLOT_NOT_FOUND' } })

    await writeAuditLog({ actorId: admin.id, action: 'blocked_slot.deleted', targetId: id, metadata: deleted[0] }, tx)
    return { deleted: true, id }
  })
})
