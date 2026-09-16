import { describe, expect, it } from 'vitest'

const ACTIVE_STATUSES = new Set(['pending', 'confirmed'])

function validateSlot(time: string) {
  const match = /^(?:09|1[0-9]|20):00$/.test(time)
  return match
}

function validateOwnership(carUserId: string, userId: string) {
  return carUserId === userId
}

function canBookOnDate(date: string, holidays: string[]) {
  return !holidays.includes(date)
}

describe('booking validation invariants', () => {
  it('accepts only hourly slots from 09:00 to 20:00', () => {
    expect(validateSlot('09:00')).toBe(true)
    expect(validateSlot('15:00')).toBe(true)
    expect(validateSlot('20:00')).toBe(true)
    expect(validateSlot('08:00')).toBe(false)
    expect(validateSlot('21:00')).toBe(false)
    expect(validateSlot('10:30')).toBe(false)
  })

  it('rejects booking another customer\'s car', () => {
    expect(validateOwnership('user-a', 'user-a')).toBe(true)
    expect(validateOwnership('user-b', 'user-a')).toBe(false)
  })

  it('rejects active holidays', () => {
    const holidays = ['2026-06-23', '2026-06-24']
    expect(canBookOnDate('2026-06-23', holidays)).toBe(false)
    expect(canBookOnDate('2026-06-24', holidays)).toBe(false)
    expect(canBookOnDate('2026-06-25', holidays)).toBe(true)
  })

  it('defines only pending and confirmed as slot-blocking statuses', () => {
    expect(ACTIVE_STATUSES.has('pending')).toBe(true)
    expect(ACTIVE_STATUSES.has('confirmed')).toBe(true)
    expect(ACTIVE_STATUSES.has('completed')).toBe(false)
    expect(ACTIVE_STATUSES.has('cancelled_customer')).toBe(false)
    expect(ACTIVE_STATUSES.has('cancelled_admin')).toBe(false)
    expect(ACTIVE_STATUSES.has('no_show')).toBe(false)
  })
})
