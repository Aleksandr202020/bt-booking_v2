import { createError } from 'h3'
import { z } from 'zod'
import { getSessionUser } from '../utils/session'
import { getSlotAvailability } from '../domain/availability/availability'
import { isValidIsoDate } from '../domain/booking/dates'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export default defineEventHandler(async (event) => {
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_AVAILABILITY_QUERY', data: { code: 'INVALID_AVAILABILITY_QUERY' } })
  }
  const query = parsed.data
  if (!isValidIsoDate(query.date)) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_DATE', data: { code: 'INVALID_DATE' } })
  }
  const user = await getSessionUser(event)
  const role = user?.role === 'admin' ? 'admin' : 'customer'
  const slots = await getSlotAvailability(query.date, role)
  return { date: query.date, slots }
})
