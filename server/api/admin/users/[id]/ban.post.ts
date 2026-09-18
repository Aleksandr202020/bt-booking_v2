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
  if (!userId || !uuidSchema.safeParse(userId).success) throw createError({ statusCode: 400, statusMessage: 'INVALID_USER_ID', data: { code: 'INVALID_USER_ID' } })
  if (userId === admin.id) throw createError({ statusCode: 403, statusMessage: 'CANNOT_BAN_SELF', data: { code: 'CANNOT_BAN_SELF' } })
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'INVALID_BAN_REQUEST', data: { code: 'INVALID_BAN_REQUEST' } })
  const body = parsed.data
  const db = getDb()
  return db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${userId}`}))`
    const rows = await tx`UPDATE users SET banned = TRUE, ban_reason = ${body.reason ?? null}, banned_at = now(), updated_at = now() WHERE id = ${userId}::uuid AND role = 'customer' RETURNING id, name, email, phone, role, banned, ban_reason, banned_at`
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'CUSTOMER_NOT_FOUND', data: { code: 'CUSTOMER_NOT_FOUND' } })

    // Revoke every existing customer session immediately when the account is banned.
    await tx`DELETE FROM sessions WHERE user_id = ${userId}::uuid`

    await writeAuditLog({ actorId: admin.id, action: 'BAN_USER', targetId: userId, metadata: rows[0] }, tx)
    return { user: rows[0] }
  })
})
