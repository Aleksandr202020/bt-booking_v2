import { requireAdmin } from '../../../utils/authorization'
import { writeAuditLog } from '../../../utils/audit'
import { getDb } from '../../../utils/db'
import { updateBooking } from '../../../domain/booking/update-booking'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_BOOKING_ID', data: { code: 'INVALID_BOOKING_ID' } })
  }

  const db = getDb()
  const rows = await db`
    SELECT id, user_id, car_id, booking_date, booking_time, status, notes
    FROM bookings
    WHERE id = ${id}
    LIMIT 1
  `
  const booking = rows[0]
  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'BOOKING_NOT_FOUND', data: { code: 'BOOKING_NOT_FOUND' } })
  }

  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw createError({ statusCode: 409, statusMessage: 'BOOKING_NOT_CANCELLABLE', data: { code: 'BOOKING_NOT_CANCELLABLE' } })
  }

  const cancelled = await updateBooking({
    bookingId: booking.id,
    userId: booking.user_id,
    carId: booking.car_id,
    bookingDate: String(booking.booking_date),
    bookingTime: String(booking.booking_time).slice(0, 5),
    status: 'cancelled_admin',
    notes: booking.notes,
  })

  await writeAuditLog({
    actorId: admin.id,
    action: 'booking.cancelled_admin',
    targetId: cancelled.id,
    metadata: {
      bookingDate: cancelled.booking_date,
      bookingTime: cancelled.booking_time,
      previousStatus: booking.status,
    },
  })

  return { booking: cancelled }
})
