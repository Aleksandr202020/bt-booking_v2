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
  const active = await db`
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
    const rows = await db`DELETE FROM cars WHERE id = ${id} RETURNING id`
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND' })

    await writeAuditLog({ actorId: admin.id, action: 'car.deleted', targetId: id })
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
