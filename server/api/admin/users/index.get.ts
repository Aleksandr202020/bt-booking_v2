import { requireAdmin } from '../../../utils/authorization'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = getDb()
  const rows = await db`
    SELECT id, name, email, phone, role, banned, ban_reason, banned_at, created_at
    FROM users
    ORDER BY created_at DESC
  `
  return { users: rows }
})
