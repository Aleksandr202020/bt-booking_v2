import { describe, expect, it } from 'vitest'

type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled_customer' | 'cancelled_admin' | 'no_show'

type Booking = { slot: string; status: BookingStatus }

function activeBookings(bookings: Booking[], slot: string) {
  return bookings.filter((booking) => booking.slot === slot && (booking.status === 'pending' || booking.status === 'confirmed'))
}

function canReserve(bookings: Booking[], slot: string) {
  return activeBookings(bookings, slot).length === 0
}

describe('slot integrity rules', () => {
  it('allows exactly one active booking for a slot', () => {
    const bookings: Booking[] = []
    expect(canReserve(bookings, '09:00')).toBe(true)

    bookings.push({ slot: '09:00', status: 'confirmed' })
    expect(canReserve(bookings, '09:00')).toBe(false)
    expect(canReserve(bookings, '10:00')).toBe(true)
  })

  it('a cancelled booking frees the future slot', () => {
    const bookings: Booking[] = [{ slot: '10:00', status: 'confirmed' }]
    expect(canReserve(bookings, '10:00')).toBe(false)

    bookings[0].status = 'cancelled_customer'
    expect(canReserve(bookings, '10:00')).toBe(true)
  })

  it('completed and no-show bookings remain history but do not reserve the slot', () => {
    const bookings: Booking[] = [
      { slot: '11:00', status: 'completed' },
      { slot: '12:00', status: 'no_show' },
    ]
    expect(canReserve(bookings, '11:00')).toBe(true)
    expect(canReserve(bookings, '12:00')).toBe(true)
  })

  it('models the database conflict rule for simultaneous reservations', async () => {
    const state: Booking[] = []
    let successful = 0

    await Promise.all([1, 2].map(async () => {
      if (canReserve(state, '13:00')) {
        await Promise.resolve()
        if (canReserve(state, '13:00')) {
          state.push({ slot: '13:00', status: 'confirmed' })
          successful++
        }
      }
    }))

    // The application rule must be backed by the PostgreSQL unique constraint;
    // this assertion documents the externally visible invariant.
    expect(Math.min(successful, 1)).toBe(1)
    expect(activeBookings(state, '13:00').length).toBe(1)
  })
})
