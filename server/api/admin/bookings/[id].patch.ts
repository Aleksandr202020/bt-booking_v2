import { z } from 'zod'
import { requireAdmin } from '../../../utils/authorization'
import { updateBooking, isValidBookingStatus } from '../../../domain/booking/update-booking'
import { isValidIsoDate } from '../../../domain/booking/dates'

const schema = z.object({
  userId: z.string().uuid(),
  carId: z.string().uuid(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingTime: z.string().regex(/^\d{2}:00$/),
  status: z.string().refine(isValidBookingStatus),
  notes: z.string().max(1000).nullable().optional(),
})

const uuidSchema = z.string().uuid()

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !uuidSchema.safeParse(id).success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_BOOKING_ID', data: { code: 'INVALID_BOOKING_ID' } })
  }

  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'INVALID_BOOKING_REQUEST',
      data: { code: 'INVALID_BOOKING_REQUEST' },
    })
  }

  const body = parsed.data
  if (!isValidIsoDate(body.bookingDate)) throw createError({ statusCode: 400, statusMessage: 'INVALID_DATE', data: { code: 'INVALID_DATE' } })
  const booking = await updateBooking({
    bookingId: id,
    userId: body.userId,
    carId: body.carId,
    bookingDate: body.bookingDate,
    bookingTime: body.bookingTime,
    status: body.status,
    notes: body.notes,
    auditActorId: admin.id,
  })

  return { booking }
})
