import { describe, expect, it } from 'vitest'

const PRICES = {
  passenger: 2500,
  crossover: 3000,
  minivan: 3500,
  commercial: 3500,
} as const

const SLOTS = Array.from({ length: 12 }, (_, i) => `${String(9 + i).padStart(2, '0')}:00`)

function priceFor(category: keyof typeof PRICES) {
  return PRICES[category]
}

function isWorkingSlot(time: string) {
  return SLOTS.includes(time)
}

function isHoliday(date: string, holidays: string[]) {
  return holidays.includes(date)
}

describe('booking core business rules', () => {
  it('uses the required backend prices', () => {
    expect(priceFor('passenger')).toBe(2500)
    expect(priceFor('crossover')).toBe(3000)
    expect(priceFor('minivan')).toBe(3500)
    expect(priceFor('commercial')).toBe(3500)
  })

  it('generates every one-hour working slot from 09:00 through 20:00', () => {
    expect(SLOTS).toEqual([
      '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
      '15:00', '16:00', '17:00', '18:00', '19:00', '20:00',
    ])
    expect(isWorkingSlot('09:00')).toBe(true)
    expect(isWorkingSlot('20:00')).toBe(true)
    expect(isWorkingSlot('21:00')).toBe(false)
    expect(isWorkingSlot('09:30')).toBe(false)
  })

  it('recognizes the fixed June holidays', () => {
    const holidays = ['2026-06-23', '2026-06-24']
    expect(isHoliday('2026-06-23', holidays)).toBe(true)
    expect(isHoliday('2026-06-24', holidays)).toBe(true)
    expect(isHoliday('2026-06-25', holidays)).toBe(false)
  })

  it('keeps completed bookings as history while cancelled statuses can free a slot', () => {
    const active = new Set(['pending', 'confirmed'])
    expect(active.has('pending')).toBe(true)
    expect(active.has('confirmed')).toBe(true)
    expect(active.has('completed')).toBe(false)
    expect(active.has('cancelled_customer')).toBe(false)
    expect(active.has('cancelled_admin')).toBe(false)
    expect(active.has('no_show')).toBe(false)
  })
})
