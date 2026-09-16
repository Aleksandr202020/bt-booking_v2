import { describe, expect, it } from 'vitest'

function allowed(date: string, today: string, maxDaysAhead: number, holidays: string[]) {
  const start = Date.parse(`${today}T00:00:00Z`)
  const target = Date.parse(`${date}T00:00:00Z`)
  return target >= start && target <= start + maxDaysAhead * 86400000 && !holidays.includes(date)
}

describe('booking window edge cases', () => {
  it('allows today and an in-window date', () => {
    expect(allowed('2026-09-16', '2026-09-16', 30, [])).toBe(true)
    expect(allowed('2026-10-01', '2026-09-16', 30, [])).toBe(true)
  })

  it('rejects past and out-of-window dates', () => {
    expect(allowed('2026-09-15', '2026-09-16', 30, [])).toBe(false)
    expect(allowed('2026-10-17', '2026-09-16', 30, [])).toBe(false)
  })

  it('rejects holidays inside the booking window', () => {
    expect(allowed('2026-09-23', '2026-09-16', 30, ['2026-09-23'])).toBe(false)
  })
})
