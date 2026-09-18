import { createError } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../../utils/authorization'
import { getDb } from '../../../utils/db'
import { writeAuditLog } from '../../../utils/audit'

const schema = z.object({
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  registrationNumber: z.string().trim().min(2).max(20),
})
const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !uuidSchema.safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_CAR_ID', data: { code: 'INVALID_CAR_ID' } })
  }
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'INVALID_CAR_REQUEST', data: { code: 'INVALID_CAR_REQUEST' } })
  const body = parsed.data

  const db = getDb()
  return db.begin(async (tx) => {
    // Serialize model/category validation against the atomic SS.COM catalog snapshot.
    await tx`SELECT pg_advisory_xact_lock(hashtext('bt-booking:ss-catalog-sync'))`

    const owners = await tx`
      SELECT user_id
      FROM cars
      WHERE id = ${id}
      LIMIT 1
    `
    if (!owners.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND', data: { code: 'CAR_NOT_FOUND' } })

    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${owners[0].user_id}`}))`

    const cars = await tx`
      SELECT id, user_id, make, model, registration_number, category
      FROM cars
      WHERE id = ${id}
      FOR UPDATE
    `
    if (!cars.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND', data: { code: 'CAR_NOT_FOUND' } })

    const model = await tx`
      SELECT v.category
      FROM vehicle_models v
      JOIN vehicle_makes m ON m.id = v.make_id
      WHERE m.name = ${body.make}
        AND v.name = ${body.model}
        AND m.active = true
        AND v.active = true
      LIMIT 1
    `
    if (!model.length) throw createError({ statusCode: 400, statusMessage: 'INVALID_VEHICLE_MODEL', data: { code: 'INVALID_VEHICLE_MODEL' } })

    const vehicleChanged = cars[0].make !== body.make || cars[0].model !== body.model
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
            category = ${model[0].category},
            updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `
      if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND' })

      await writeAuditLog({
        actorId: admin.id,
        action: 'car.updated',
        targetId: id,
        metadata: {
          userId: rows[0].user_id,
          previous: { make: cars[0].make, model: cars[0].model, registrationNumber: cars[0].registration_number, category: cars[0].category },
          current: { make: rows[0].make, model: rows[0].model, registrationNumber: rows[0].registration_number, category: rows[0].category },
        },
      }, tx)
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
