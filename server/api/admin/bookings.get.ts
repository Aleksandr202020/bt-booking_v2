import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { getDb } from '../../utils/db'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled_customer', 'cancelled_admin', 'no_show']).optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = querySchema.parse(getQuery(event))
  const db = getDb()

  const rows = await db`
    SELECT
      b.id, b.user_id, b.car_id, b.booking_date, b.booking_time,
      b.price_cents, b.status, b.notes, b.created_at, b.updated_at,
      u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
      c.make, c.model, c.registration_number, c.category
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN cars c ON c.id = b.car_id
    WHERE (${query.date ?? null}::date IS NULL OR b.booking_date = ${query.date ?? null})
      AND (${query.status ?? null}::booking_status IS NULL OR b.status = ${query.status ?? null})
    ORDER BY b.booking_date ASC, b.booking_time ASC
  `

  return { bookings: rows }
})
