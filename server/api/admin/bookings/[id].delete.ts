import { z } from 'zod'
import { requireAdmin } from '../../../utils/authorization'
import { cancelAdminBooking } from '../../../domain/booking/update-booking'

const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !uuidSchema.safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_BOOKING_ID', data: { code: 'INVALID_BOOKING_ID' } })
  }

  const cancelled = await cancelAdminBooking(id, admin.id)

  return { booking: cancelled }
})
