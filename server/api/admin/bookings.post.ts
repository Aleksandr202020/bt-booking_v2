import { createError } from 'h3'
import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { createBooking } from '../../domain/booking/create-booking'
import { isValidIsoDate } from '../../domain/booking/dates'

const schema = z.object({
  userId: z.string().uuid(),
  carId: z.string().uuid(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingTime: z.string().regex(/^\d{2}:00$/),
  notes: z.string().max(1000).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'INVALID_BOOKING_REQUEST',
      data: { code: 'INVALID_BOOKING_REQUEST' },
    })
  }

  if (!isValidIsoDate(parsed.data.bookingDate)) throw createError({ statusCode: 400, statusMessage: 'INVALID_DATE', data: { code: 'INVALID_DATE' } })

  const booking = await createBooking({
    userId: parsed.data.userId,
    carId: parsed.data.carId,
    bookingDate: parsed.data.bookingDate,
    bookingTime: parsed.data.bookingTime,
    notes: parsed.data.notes,
    isAdmin: true,
    auditActorId: admin.id,
  })
  return { booking }
})
