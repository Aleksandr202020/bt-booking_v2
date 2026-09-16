import { z } from 'zod'
import { getSessionUser } from '../utils/session'
import { getSlotAvailability } from '../domain/availability/availability'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export default defineEventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  const user = await getSessionUser(event)
  const role = user?.role === 'admin' ? 'admin' : 'customer'
  const slots = await getSlotAvailability(query.date, role)
  return { date: query.date, slots }
})
