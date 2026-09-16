import { describe, expect, it } from 'vitest'
import { getRigaNowParts, isPastSlot } from '../server/domain/booking/dates'

const SLOTS = Array.from({ length: 12 }, (_, i) => `${String(9 + i).padStart(2, '0')}:00`)

type State = 'available' | 'booked' | 'blocked' | 'past' | 'holiday' | 'outside_booking_window'

function resolveState(input: {
  time: string
  booked?: boolean
  blocked?: boolean
  holiday?: boolean
  past?: boolean
  withinWindow?: boolean
}): State {
  if (input.holiday) return 'holiday'
  if (input.past) return 'past'
  if (input.withinWindow === false) return 'outside_booking_window'
  if (input.blocked) return 'blocked'
  if (input.booked) return 'booked'
  return 'available'
}

describe('availability core rules', () => {
  it('always has exactly 12 working slots', () => {
    expect(SLOTS).toHaveLength(12)
    expect(SLOTS[0]).toBe('09:00')
    expect(SLOTS[11]).toBe('20:00')
  })

  it('keeps all non-available states explicit', () => {
    expect(resolveState({ time: '09:00' })).toBe('available')
    expect(resolveState({ time: '10:00', booked: true })).toBe('booked')
    expect(resolveState({ time: '11:00', blocked: true })).toBe('blocked')
    expect(resolveState({ time: '12:00', past: true })).toBe('past')
    expect(resolveState({ time: '13:00', holiday: true })).toBe('holiday')
    expect(resolveState({ time: '14:00', withinWindow: false })).toBe('outside_booking_window')
  })

  it('uses Europe/Riga when deciding the current calendar date', () => {
    const parts = getRigaNowParts(new Date('2026-09-16T21:30:00.000Z'))
    expect(parts.date).toBe('2026-09-17')
    expect(parts.time).toBe('00:30')
  })

  it('marks the current and earlier one-hour slots as past', () => {
    const now = new Date('2026-09-16T10:15:00.000Z')
    expect(isPastSlot('2026-09-16', '12:00', now)).toBe(true)
    expect(isPastSlot('2026-09-16', '13:00', now)).toBe(true)
    expect(isPastSlot('2026-09-16', '14:00', now)).toBe(false)
    expect(isPastSlot('2026-09-16', '09:00', now)).toBe(true)
  })
})
