import { createError } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../../utils/authorization'
import { getDb } from '../../../utils/db'
import { writeAuditLog } from '../../../utils/audit'

const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !uuidSchema.safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_CAR_ID' })
  }

  const db = getDb()
  return db.begin(async (tx) => {
    const owners = await tx`
      SELECT user_id
      FROM cars
      WHERE id = ${id}
      LIMIT 1
    `
    if (!owners.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND' })

    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${owners[0].user_id}`}))`

    const cars = await tx`
      SELECT id
      FROM cars
      WHERE id = ${id}
      FOR UPDATE
    `
    if (!cars.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND' })

    const active = await tx`
      SELECT 1 FROM bookings
      WHERE car_id = ${id} AND status IN ('pending', 'confirmed')
      LIMIT 1
    `
    if (active.length) {
      throw createError({
        statusCode: 409,
        statusMessage: 'CAR_HAS_ACTIVE_BOOKING',
        data: { code: 'CAR_HAS_ACTIVE_BOOKING' },
      })
    }

    try {
      const rows = await tx`DELETE FROM cars WHERE id = ${id} RETURNING id`
      if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND' })

      await writeAuditLog({ actorId: admin.id, action: 'car.deleted', targetId: id }, tx)
      return { ok: true }
    } catch (error: any) {
      if (error?.statusCode) throw error
      if (error?.code === '23503') {
        throw createError({
          statusCode: 409,
          statusMessage: 'CAR_HAS_BOOKING_HISTORY',
          data: { code: 'CAR_HAS_BOOKING_HISTORY' },
        })
      }
      throw error
    }
  })
})
