import { createError } from 'h3'
import { z } from 'zod'
import { requireUnbannedUser } from '../../utils/authorization'
import { getDb } from '../../utils/db'

const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const user = await requireUnbannedUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !uuidSchema.safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_CAR_ID', data: { code: 'INVALID_CAR_ID' } })
  }

  const db = getDb()

  return db.begin(async (tx: any) => {
    // Serialize car deletion with customer booking creation/update through the same user lock.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-user:${user.id}`}))`

    const owned = await tx`
      SELECT id
      FROM cars
      WHERE id = ${id} AND user_id = ${user.id}
      LIMIT 1
    `
    if (!owned.length) {
      throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND', data: { code: 'CAR_NOT_FOUND' } })
    }

    const active = await tx`
      SELECT 1
      FROM bookings
      WHERE car_id = ${id} AND user_id = ${user.id} AND status IN ('pending', 'confirmed')
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
      const rows = await tx`
        DELETE FROM cars
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id
      `
      if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND', data: { code: 'CAR_NOT_FOUND' } })
      return { deleted: true, id: rows[0].id }
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
