import { requireUser } from '../../utils/authorization'
import { cancelCustomerBooking } from '../../domain/booking/cancel-customer-booking'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'INVALID_BOOKING_ID' })

  const booking = await cancelCustomerBooking(id, user.id)
  return { booking }
})
