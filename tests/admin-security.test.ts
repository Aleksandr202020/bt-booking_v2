import { describe, expect, it } from 'vitest'

type User = { role: 'customer' | 'admin'; banned: boolean }

function requireAdmin(user: User | null) {
  if (!user) return 401
  if (user.role !== 'admin') return 403
  return 200
}

function canCreateBooking(user: User) {
  return !user.banned
}

describe('admin and customer security invariants', () => {
  it('requires an authenticated admin for admin operations', () => {
    expect(requireAdmin(null)).toBe(401)
    expect(requireAdmin({ role: 'customer', banned: false })).toBe(403)
    expect(requireAdmin({ role: 'admin', banned: false })).toBe(200)
  })

  it('a banned customer cannot create a new booking', () => {
    expect(canCreateBooking({ role: 'customer', banned: true })).toBe(false)
    expect(canCreateBooking({ role: 'customer', banned: false })).toBe(true)
  })

  it('admin is not blocked by the customer ban rule', () => {
    expect(requireAdmin({ role: 'admin', banned: true })).toBe(200)
  })
})
