import { requireAdmin } from '../../../utils/authorization'
import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = getDb()
  const rows = await db`
    SELECT id, booking_date, booking_time, reason, created_by, created_at
    FROM blocked_slots
    ORDER BY booking_date ASC, booking_time ASC NULLS FIRST
  `
  return { blockedSlots: rows }
})
