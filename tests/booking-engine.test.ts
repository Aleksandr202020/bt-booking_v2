import { describe, expect, it } from 'vitest'

function isCustomerBookingAllowed(date: string, today: string, maxDaysAhead: number, holidays: string[]) {
  const start = new Date(`${today}T00:00:00Z`).getTime()
  const target = new Date(`${date}T00:00:00Z`).getTime()
  const max = start + maxDaysAhead * 24 * 60 * 60 * 1000
  return target >= start && target <= max && !holidays.includes(date)
}

describe('booking window edge cases', () => {
  it('allows today and dates inside the configured future window', () => {
    expect(isCustomerBookingAllowed('2026-09-16', '2026-09-16', 30, [])).toBe(true)
    expect(isCustomerBookingAllowed('2026-10-01', '2026-09-16', 30, [])).toBe(true)
  })

  it('rejects dates outside the future window and dates in the past', () => {
    expect(isCustomerBookingAllowed('2026-10-17', '2026-09-16', 30, [])).toBe(false)
    expect(isCustomerBookingAllowed('2026-09-15', '2026-09-16', 30, [])).toBe(false)
  })

  it('rejects a holiday even when it is inside the booking window', () => {
    expect(isCustomerBookingAllowed('2026-09-23', '2026-09-16', 30, ['2026-09-23'])).toBe(false)
  })
})
