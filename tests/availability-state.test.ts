import { describe, expect, it } from 'vitest'

type State = 'available' | 'booked' | 'blocked' | 'past' | 'holiday' | 'outside_booking_window'

function state(input: { booked?: boolean; blocked?: boolean; past?: boolean; holiday?: boolean; inWindow?: boolean }): State {
  if (input.past) return 'past'
  if (input.holiday) return 'holiday'
  if (input.inWindow === false) return 'outside_booking_window'
  if (input.blocked) return 'blocked'
  if (input.booked) return 'booked'
  return 'available'
}

describe('availability state precedence', () => {
  it('returns all required states', () => {
    expect(state({})).toBe('available')
    expect(state({ booked: true })).toBe('booked')
    expect(state({ blocked: true })).toBe('blocked')
    expect(state({ past: true })).toBe('past')
    expect(state({ holiday: true })).toBe('holiday')
    expect(state({ inWindow: false })).toBe('outside_booking_window')
  })

  it('treats past as non-bookable even if the slot is otherwise available', () => {
    expect(state({ past: true, booked: false })).toBe('past')
  })
})
