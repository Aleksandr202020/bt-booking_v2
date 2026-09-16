import { z } from 'zod'
import { requireUnbannedUser } from '../../utils/authorization'
import { getDb } from '../../utils/db'

const schema = z.object({
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  registrationNumber: z.string().trim().min(2).max(20),
})

export default defineEventHandler(async (event) => {
  const user = await requireUnbannedUser(event)
  const body = schema.parse(await readBody(event))
  const db = getDb()

  const models = await db`
    SELECT v.name, v.category
    FROM vehicle_models v
    JOIN vehicle_makes m ON m.id = v.make_id
    WHERE m.name = ${body.make} AND v.name = ${body.model} AND m.active = TRUE AND v.active = TRUE
    LIMIT 1
  `

  if (!models.length) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_VEHICLE_MODEL', data: { code: 'INVALID_VEHICLE_MODEL' } })
  }

  const car = await db`
    INSERT INTO cars (user_id, make, model, registration_number, category)
    VALUES (${user.id}, ${body.make}, ${body.model}, ${body.registrationNumber}, ${models[0].category})
    RETURNING id, make, model, registration_number, category, created_at, updated_at
  `
  return { car: car[0] }
})
