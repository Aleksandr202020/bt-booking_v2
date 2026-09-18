import { createError } from 'h3'
import { getDb } from '../../utils/db'
import { WORKING_SLOTS } from '../booking/booking-rules'
import { isPastSlot, isValidIsoDate, isWithinCustomerBookingWindow } from './date-availability'

export type SlotState = 'available' | 'booked' | 'blocked' | 'past' | 'holiday' | 'outside_booking_window'

export async function getSlotAvailability(date: string, userRole: 'customer' | 'admin' = 'customer') {
  if (!isValidIsoDate(date)) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_DATE', data: { code: 'INVALID_DATE' } })
  }

  const db = getDb()
  const [bookings, blocks, holidays] = await Promise.all([
    db`SELECT booking_time, id, user_id, car_id, status FROM bookings WHERE booking_date = ${date} AND status IN ('pending','confirmed')`,
    db`SELECT booking_time, reason FROM blocked_slots WHERE booking_date = ${date}`,
    db`SELECT id, name FROM holidays WHERE date = ${date} AND active = TRUE LIMIT 1`,
  ])

  const wholeDayBlock = blocks.some((row: any) => row.booking_time === null)
  const holiday = holidays[0]
  const withinWindow = userRole === 'admin' ? true : await isWithinCustomerBookingWindow(date)
  const bookingByTime = new Map(bookings.map((row: any) => [String(row.booking_time).slice(0, 5), row]))
  const blockByTime = new Map(blocks.map((row: any) => [String(row.booking_time).slice(0, 5), row]))

  return WORKING_SLOTS.map((time) => {
    let state: SlotState = 'available'
    let reason: string | undefined

    if (holiday) {
      state = 'holiday'
      reason = holiday.name
    } else if (isPastSlot(date, time)) {
      state = 'past'
    } else if (!withinWindow) {
      state = 'outside_booking_window'
    } else if (wholeDayBlock || blockByTime.has(time)) {
      state = 'blocked'
      reason = userRole === 'admin' ? blockByTime.get(time)?.reason : undefined
    } else if (bookingByTime.has(time)) {
      state = 'booked'
    }

    const booking = bookingByTime.get(time)
    return {
      time,
      state,
      available: state === 'available',
      reason,
      bookingId: userRole === 'admin' ? booking?.id ?? null : null,
    }
  })
}
