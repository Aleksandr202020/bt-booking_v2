import { createError } from 'h3'
import { z } from 'zod'
import { requireUser } from '../../utils/authorization'
import { cancelCustomerBooking } from '../../domain/booking/cancel-customer-booking'

const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id || !uuidSchema.safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_BOOKING_ID', data: { code: 'INVALID_BOOKING_ID' } })
  }

  const booking = await cancelCustomerBooking(id, user.id)
  return { booking }
})
