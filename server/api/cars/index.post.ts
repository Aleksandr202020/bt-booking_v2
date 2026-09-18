import { createError } from 'h3'
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
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'INVALID_CAR_REQUEST',
      data: { code: 'INVALID_CAR_REQUEST' },
    })
  }

  const body = parsed.data
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

  return db.begin(async (tx) => {
    // Keep car creation on the same user lock as booking and ban/unban mutations.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${user.id}`}))`

    const [currentUser] = await tx`
      SELECT banned FROM users WHERE id = ${user.id} FOR SHARE
    `
    if (!currentUser || currentUser.banned) {
      throw createError({ statusCode: 403, statusMessage: 'CLIENT_BANNED', data: { code: 'CLIENT_BANNED' } })
    }

    try {
      const car = await tx`
        INSERT INTO cars (user_id, make, model, registration_number, category)
        VALUES (${user.id}, ${body.make}, ${body.model}, ${body.registrationNumber}, ${models[0].category})
        RETURNING id, make, model, registration_number, category, created_at, updated_at
      `
      return { car: car[0] }
    } catch (error: any) {
      if (error?.code === '23505') {
        throw createError({
          statusCode: 409,
          statusMessage: 'REGISTRATION_ALREADY_EXISTS',
          data: { code: 'REGISTRATION_ALREADY_EXISTS' },
        })
      }
      throw error
    }
  })
})
