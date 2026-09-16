import { requireUser } from '../../utils/authorization'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getDb()
  const cars = await db`
    SELECT id, make, model, registration_number, category, created_at, updated_at
    FROM cars
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `
  return { cars }
})
