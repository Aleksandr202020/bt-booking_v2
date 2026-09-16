import { z } from 'zod'
import { requireAdmin } from '../../utils/authorization'
import { createBooking } from '../../domain/booking/create-booking'

const schema = z.object({
  userId: z.string().uuid(),
  carId: z.string().uuid(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingTime: z.string().regex(/^\d{2}:00$/),
  notes: z.string().max(1000).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = schema.parse(await readBody(event))
  const booking = await createBooking({
    userId: body.userId,
    carId: body.carId,
    bookingDate: body.bookingDate,
    bookingTime: body.bookingTime,
    notes: body.notes,
    isAdmin: true,
  })
  return { booking }
})
