import { requireUnbannedUser } from '../../utils/authorization'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUnbannedUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'CAR_NOT_FOUND', data: { code: 'CAR_NOT_FOUND' } })
  const db = getDb()

  const active = await db`
    SELECT 1 FROM bookings
    WHERE car_id = ${id} AND status IN ('pending', 'confirmed')
    LIMIT 1
  `
  if (active.length) {
    throw createError({ statusCode: 409, statusMessage: 'CAR_HAS_ACTIVE_BOOKING', data: { code: 'CAR_HAS_ACTIVE_BOOKING' } })
  }

  try {
    const rows = await db`
      DELETE FROM cars
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id
    `
    if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'CAR_NOT_FOUND', data: { code: 'CAR_NOT_FOUND' } })
    return { deleted: true, id: rows[0].id }
  } catch (error: any) {
    if (error?.code === '23503') {
      throw createError({ statusCode: 409, statusMessage: 'CAR_HAS_BOOKING_HISTORY', data: { code: 'CAR_HAS_BOOKING_HISTORY' } })
    }
    throw error
  }
})
