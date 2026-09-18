import { createError } from 'h3'
import { z } from 'zod'
import { requireUnbannedUser } from '../../utils/authorization'
import { createBooking } from '../../domain/booking/create-booking'
import { isValidIsoDate } from '../../domain/booking/dates'

const schema = z.object({
  carId: z.string().uuid(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingTime: z.string().regex(/^\d{2}:00$/),
  notes: z.string().max(1000).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireUnbannedUser(event)
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
  const booking = await createBooking({
    userId: user.id,
    carId: body.carId,
    bookingDate: body.bookingDate,
    bookingTime: body.bookingTime,
    notes: body.notes,
    isAdmin: user.role === 'admin',
    auditActorId: user.role === 'admin' ? user.id : undefined,
  })
  return { booking }
})
