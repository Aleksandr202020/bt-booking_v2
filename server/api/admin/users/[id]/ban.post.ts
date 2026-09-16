import { z } from 'zod'
import { requireAdmin } from '../../../../utils/authorization'
import { getDb } from '../../../../utils/db'

const schema = z.object({ reason: z.string().trim().max(500).optional() })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const userId = getRouterParam(event, 'id')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'INVALID_USER_ID' })
  const body = schema.parse(await readBody(event))
  const db = getDb()

  const rows = await db`
    UPDATE users
    SET banned = TRUE, ban_reason = ${body.reason ?? null}, banned_at = now(), updated_at = now()
    WHERE id = ${userId}::uuid
    RETURNING id, banned, ban_reason, banned_at
  `
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'USER_NOT_FOUND' })

  await db`
    INSERT INTO audit_logs (actor_id, action, target_id, metadata)
    VALUES (${admin.id}, 'BAN_USER', ${userId}::uuid, ${JSON.stringify({ reason: body.reason ?? null })}::jsonb)
  `
  return { user: rows[0] }
})
