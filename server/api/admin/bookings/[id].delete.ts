import { requireAdmin } from '../../../utils/authorization'
import { writeAuditLog } from '../../../utils/audit'
import { cancelAdminBooking } from '../../../domain/booking/update-booking'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_BOOKING_ID', data: { code: 'INVALID_BOOKING_ID' } })
  }

  const cancelled = await cancelAdminBooking(id)

  await writeAuditLog({
    actorId: admin.id,
    action: 'booking.cancelled_admin',
    targetId: cancelled.id,
    metadata: {
      bookingDate: cancelled.booking_date,
      bookingTime: cancelled.booking_time,
      previousStatus: 'pending_or_confirmed',
    },
  })

  return { booking: cancelled }
})
