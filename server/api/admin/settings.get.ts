import { requireAdmin } from '../../utils/authorization'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = getDb()
  const rows = await db`SELECT key, value FROM app_settings ORDER BY key`
  return { settings: rows }
})
