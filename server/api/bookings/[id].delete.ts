import { requireUser } from '../../utils/authorization'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'INVALID_BOOKING_ID' })

  const db = getDb()
  const rows = await db`
    UPDATE bookings
    SET status = 'cancelled_customer', updated_at = now()
    WHERE id = ${id}::uuid
      AND user_id = ${user.id}
      AND status IN ('pending', 'confirmed')
      AND (booking_date::text || ' ' || booking_time::text) > to_char(now() AT TIME ZONE 'Europe/Riga', 'YYYY-MM-DD HH24:MI:SS')
    RETURNING id, status, booking_date, booking_time
  `

  if (!rows.length) {
    throw createError({ statusCode: 404, statusMessage: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE', data: { code: 'BOOKING_NOT_FOUND_OR_NOT_CANCELLABLE' } })
  }
  return { booking: rows[0] }
})
