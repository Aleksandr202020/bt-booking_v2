import { createError } from 'h3'
import { z } from 'zod'
import { requireUnbannedUser } from '../../utils/authorization'
import { getDb } from '../../utils/db'
import { writeAuditLog } from '../../utils/audit'

const schema = z.object({
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  registrationNumber: z.string().trim().min(2).max(20),
})

const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const user = await requireUnbannedUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !uuidSchema.safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_CAR_ID', data: { code: 'INVALID_CAR_ID' } })
  }

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

  return db.begin(async (tx: any) => {
    // Serialize model/category validation against the atomic SS.COM catalog snapshot.
    await tx`SELECT pg_advisory_xact_lock(hashtext('bt-booking:ss-catalog-sync'))`

    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${user.id}`}))`

    const [currentUser] = await tx`SELECT banned FROM users WHERE id = ${user.id} FOR SHARE`
    if (!currentUser || currentUser.banned) {
      throw createError({
        statusCode: 403,
        statusMessage: 'CLIENT_BANNED',
        data: { code: 'CLIENT_BANNED' },
      })
    }

    const owned = await tx`
      SELECT id, make, model, registration_number, category
      FROM cars
      WHERE id = ${id} AND user_id = ${user.id}
      FOR UPDATE
    `
    if (!owned.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'CAR_NOT_FOUND',
        data: { code: 'CAR_NOT_FOUND' },
      })
    }

    const models = await tx`
      SELECT v.category
      FROM vehicle_models v
      JOIN vehicle_makes m ON m.id = v.make_id
      WHERE m.name = ${body.make}
        AND v.name = ${body.model}
        AND m.active = TRUE
        AND v.active = TRUE
      LIMIT 1
    `
    if (!models.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'INVALID_VEHICLE_MODEL',
        data: { code: 'INVALID_VEHICLE_MODEL' },
      })
    }

    const vehicleChanged = owned[0].make !== body.make || owned[0].model !== body.model
    if (vehicleChanged) {
      const activeBookings = await tx`
        SELECT id
        FROM bookings
        WHERE car_id = ${id}
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `
      if (activeBookings.length) {
        throw createError({
          statusCode: 409,
          statusMessage: 'CAR_HAS_ACTIVE_BOOKING',
          data: { code: 'CAR_HAS_ACTIVE_BOOKING' },
        })
      }
    }

    try {
      const rows = await tx`
        UPDATE cars
        SET make = ${body.make},
            model = ${body.model},
            registration_number = ${body.registrationNumber},
            category = ${models[0].category},
            updated_at = now()
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, make, model, registration_number, category, created_at, updated_at
      `
      if (!rows.length) {
        throw createError({
          statusCode: 404,
          statusMessage: 'CAR_NOT_FOUND',
          data: { code: 'CAR_NOT_FOUND' },
        })
      }
      await writeAuditLog({ actorId: user.id, action: 'car.updated', targetId: rows[0].id, metadata: { previous: { make: owned[0].make, model: owned[0].model, registrationNumber: owned[0].registration_number, category: owned[0].category }, current: { make: rows[0].make, model: rows[0].model, registrationNumber: rows[0].registration_number, category: rows[0].category } } }, tx)
      return { car: rows[0] }
    } catch (error: any) {
      if (error?.statusCode) throw error
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
