import { createError } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { writeAuditLog } from '../../utils/audit'
import { getDb } from '../../utils/db'
import { isValidIsoDate, isWorkingSlot } from '../../domain/booking/dates'

const schema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingTime: z.string().regex(/^\d{2}:00$/).nullable().optional(),
  reason: z.string().trim().min(1).max(300),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'INVALID_BLOCKED_SLOT_REQUEST', data: { code: 'INVALID_BLOCKED_SLOT_REQUEST' } })
  const body = parsed.data
  if (!isValidIsoDate(body.bookingDate)) throw createError({ statusCode: 400, statusMessage: 'INVALID_DATE', data: { code: 'INVALID_DATE' } })
  if (body.bookingTime !== null && body.bookingTime !== undefined && !isWorkingSlot(body.bookingTime)) throw createError({ statusCode: 400, statusMessage: 'INVALID_SLOT', data: { code: 'INVALID_SLOT' } })
  const db = getDb()
  return db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`booking-date:${body.bookingDate}`}))`
    const holiday = await tx`SELECT id FROM holidays WHERE date = ${body.bookingDate} AND active = TRUE LIMIT 1`
    if (holiday.length) throw createError({ statusCode: 409, statusMessage: 'HOLIDAY', data: { code: 'HOLIDAY' } })
    const activeBookings = body.bookingTime
      ? await tx`SELECT id FROM bookings WHERE booking_date = ${body.bookingDate} AND booking_time = ${body.bookingTime} AND status IN ('pending', 'confirmed') LIMIT 1`
      : await tx`SELECT id FROM bookings WHERE booking_date = ${body.bookingDate} AND status IN ('pending', 'confirmed') LIMIT 1`
    if (activeBookings.length) throw createError({ statusCode: 409, statusMessage: 'ACTIVE_BOOKING_EXISTS', data: { code: 'ACTIVE_BOOKING_EXISTS' } })

    // A whole-day block and a slot block are mutually exclusive for the same date.
    // Enforce this under the date advisory lock so concurrent admin mutations cannot
    // create a logically contradictory calendar state.
    const conflictingBlock = body.bookingTime
      ? await tx`SELECT id FROM blocked_slots WHERE booking_date = ${body.bookingDate} AND booking_time IS NULL LIMIT 1`
      : await tx`SELECT id FROM blocked_slots WHERE booking_date = ${body.bookingDate} LIMIT 1`
    if (conflictingBlock.length) {
      throw createError({ statusCode: 409, statusMessage: 'SLOT_ALREADY_BLOCKED', data: { code: 'SLOT_ALREADY_BLOCKED' } })
    }

    try {
      const rows = await tx`INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by) VALUES (${body.bookingDate}, ${body.bookingTime ?? null}, ${body.reason}, ${admin.id}) RETURNING *`
      await writeAuditLog({ actorId: admin.id, action: 'blocked_slot.created', targetId: rows[0].id, metadata: rows[0] }, tx)
      return { blockedSlot: rows[0] }
    } catch (error: any) {
      if (error?.code === '23505' || (error?.code === '23514' && error?.constraint_name === 'blocked_slots_scope_conflict_chk')) {
        throw createError({ statusCode: 409, statusMessage: 'SLOT_ALREADY_BLOCKED', data: { code: 'SLOT_ALREADY_BLOCKED' } })
      }
      throw error
    }
  })
})
