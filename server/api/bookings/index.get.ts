import { requireUser } from '../../utils/authorization'
import { getDb } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = getDb()
  const bookings = await db`
    SELECT b.id, b.booking_date, b.booking_time, b.price_cents, b.status, b.notes,
           b.created_at, b.updated_at,
           c.id AS car_id, c.make, c.model, c.registration_number, c.category
    FROM bookings b
    JOIN cars c ON c.id = b.car_id
    WHERE b.user_id = ${user.id}
    ORDER BY b.booking_date DESC, b.booking_time DESC
  `
  return { bookings }
})
