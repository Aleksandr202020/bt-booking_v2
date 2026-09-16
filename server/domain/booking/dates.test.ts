import { describe, expect, it } from 'vitest'
import { addCalendarDays, getRigaNowParts, isPastSlot, isValidIsoDate, isWorkingSlot } from './dates'

describe('booking dates and slots', () => {
  it('accepts valid calendar dates only', () => {
    expect(isValidIsoDate('2026-09-16')).toBe(true)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('16-09-2026')).toBe(false)
  })

  it('accepts only the 09:00 through 20:00 working slots', () => {
    expect(isWorkingSlot('09:00')).toBe(true)
    expect(isWorkingSlot('20:00')).toBe(true)
    expect(isWorkingSlot('08:00')).toBe(false)
    expect(isWorkingSlot('21:00')).toBe(false)
    expect(isWorkingSlot('09:30')).toBe(false)
  })

  it('converts an instant to the correct Europe/Riga calendar date and time', () => {
    expect(getRigaNowParts(new Date('2026-09-16T20:30:00Z'))).toEqual({
      date: '2026-09-16',
      time: '23:30',
    })
    expect(getRigaNowParts(new Date('2026-09-16T21:30:00Z'))).toEqual({
      date: '2026-09-17',
      time: '00:30',
    })
  })

  it('adds calendar days without relying on local server timezone', () => {
    expect(addCalendarDays('2026-09-16', 0)).toBe('2026-09-16')
    expect(addCalendarDays('2026-09-16', 1)).toBe('2026-09-17')
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('evaluates past slots in Europe/Riga', () => {
    const now = new Date('2026-09-16T10:30:00Z')
    expect(isPastSlot('2026-09-16', '09:00', now)).toBe(true)
    expect(isPastSlot('2026-09-16', '20:00', now)).toBe(false)
  })
})
