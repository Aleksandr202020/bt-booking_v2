import { requireAdmin } from '../../utils/authorization'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = getDb()
  const rows = await db`
    SELECT id, date, name, active FROM holidays ORDER BY date ASC
  `
  return { holidays: rows }
})
