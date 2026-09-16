import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { getDb } from '../../utils/db'

const schema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { limit } = schema.parse(getQuery(event))
  const db = getDb()
  const rows = await db`
    SELECT a.id, a.action, a.target_id, a.metadata, a.created_at,
           u.name AS actor_name, u.email AS actor_email
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_id
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `
  return { logs: rows }
})
