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
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'CAR_NOT_FOUND', data: { code: 'CAR_NOT_FOUND' } })
  const body = schema.parse(await readBody(event))
  const db = getDb()

  const models = await db`
    SELECT v.category
    FROM vehicle_models v
    JOIN vehicle_makes m ON m.id = v.make_id
    WHERE m.name = ${body.make} AND v.name = ${body.model} AND m.active = TRUE AND v.active = TRUE
    LIMIT 1
  `
  if (!models.length) throw createError({ statusCode: 400, statusMessage: 'INVALID_VEHICLE_MODEL', data: { code: 'INVALID_VEHICLE_MODEL' } })

  const rows = await db`
    UPDATE cars
    SET make = ${body.make}, model = ${body.model}, registration_number = ${body.registrationNumber},
        category = ${models[0].category}, updated_at = now()
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING id, make, model, registration_number, category, created_at, updated_at
  `
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND', data: { code: 'CAR_NOT_FOUND' } })
  return { car: rows[0] }
})
