import { requireAdmin } from '../../utils/authorization'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = getDb()
  const rows = await db`
    SELECT c.id, c.user_id, c.make, c.model, c.registration_number, c.category,
           c.created_at, u.name AS customer_name, u.phone AS customer_phone
    FROM cars c
    JOIN users u ON u.id = c.user_id
    ORDER BY u.name ASC, c.make ASC, c.model ASC
  `
  return { cars: rows }
})
