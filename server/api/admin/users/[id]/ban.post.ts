import { createError } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../../../utils/authorization'
import { writeAuditLog } from '../../../../utils/audit'
import { getDb } from '../../../../utils/db'

const uuidSchema = z.string().uuid()
const schema = z.object({ reason: z.string().trim().max(500).optional() })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const userId = getRouterParam(event, 'id')
  if (!userId || !uuidSchema.safeParse(userId).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_USER_ID', data: { code: 'INVALID_USER_ID' } })
  }
  if (userId === admin.id) throw createError({ statusCode: 403, statusMessage: 'CANNOT_BAN_SELF', data: { code: 'CANNOT_BAN_SELF' } })
  const body = schema.parse(await readBody(event))
  const db = getDb()

  return db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${userId}`}))`

    const rows = await tx`
      UPDATE users
      SET banned = TRUE, ban_reason = ${body.reason ?? null}, banned_at = now(), updated_at = now()
      WHERE id = ${userId}::uuid AND role = 'customer'
      RETURNING id, banned, ban_reason, banned_at
    `
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'CUSTOMER_NOT_FOUND', data: { code: 'CUSTOMER_NOT_FOUND' } })

    await writeAuditLog({
      actorId: admin.id,
      action: 'BAN_USER',
      targetId: userId,
      metadata: { reason: body.reason ?? null },
    }, tx)

    return { user: rows[0] }
  })
})
