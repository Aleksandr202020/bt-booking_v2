import { describe, expect, it, vi } from 'vitest'

// Nuxt auto-imports these helpers in server routes. These tests import
// handlers directly, so provide the minimal equivalents.
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: { params?: Record<string, string> }, key: string) => event.params?.[key])
vi.stubGlobal('readBody', async () => ({}))
vi.stubGlobal('createError', (error: Record<string, unknown>) => Object.assign(new Error(String(error.statusMessage ?? 'ERROR')), error))

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

async function expectRejected(handler: (event: any) => Promise<unknown>, event: any, expected: Record<string, unknown>) {
  await expect(handler(event)).rejects.toMatchObject(expected)
}

describe('admin API authorization contracts', () => {
  it('GET /api/admin/bookings rejects unauthenticated users and customers before database access', async () => {
    vi.resetModules()
    const requireAdminMock = vi.fn()
    vi.doMock('../server/utils/authorization', () => ({ requireAdmin: requireAdminMock }))
    vi.doMock('../server/utils/db', () => ({ getDb: vi.fn(() => { throw new Error('database must not be reached') }) }))
    vi.doMock('h3', () => ({ getQuery: vi.fn(() => ({})) }))

    const { default: handler } = await import('../server/api/admin/bookings.get')

    requireAdminMock.mockRejectedValueOnce({ statusCode: 401, statusMessage: 'AUTH_REQUIRED' })
    await expectRejected(handler, {}, { statusCode: 401, statusMessage: 'AUTH_REQUIRED' })
    requireAdminMock.mockRejectedValueOnce({ statusCode: 403, statusMessage: 'FORBIDDEN' })
    await expectRejected(handler, {}, { statusCode: 403, statusMessage: 'FORBIDDEN' })
    expect(requireAdminMock).toHaveBeenCalledTimes(2)
  })

  it('POST /api/admin/users/:id/ban rejects customer access before changing any user', async () => {
    vi.resetModules()
    const requireAdminMock = vi.fn().mockRejectedValue({ statusCode: 403, statusMessage: 'FORBIDDEN' })
    const dbMock = vi.fn(() => { throw new Error('database must not be reached') })
    vi.doMock('../server/utils/authorization', () => ({ requireAdmin: requireAdminMock }))
    vi.doMock('../server/utils/db', () => ({ getDb: () => dbMock }))
    vi.doMock('h3', () => ({ getRouterParam: vi.fn(), readBody: vi.fn() }))

    const { default: handler } = await import('../server/api/admin/users/[id]/ban.post')
    await expectRejected(handler, {}, { statusCode: 403, statusMessage: 'FORBIDDEN' })
    expect(dbMock).not.toHaveBeenCalled()
  })

  it('POST /api/admin/users/:id/ban rejects an admin trying to ban themselves', async () => {
    vi.resetModules()
    const admin = { id: '00000000-0000-0000-0000-000000000001' }
    const requireAdminMock = vi.fn().mockResolvedValue(admin)
    const dbMock = vi.fn(() => { throw new Error('database must not be reached') })
    vi.doMock('../server/utils/authorization', () => ({ requireAdmin: requireAdminMock }))
    vi.doMock('../server/utils/db', () => ({ getDb: () => dbMock }))
    vi.doMock('h3', () => ({ getRouterParam: vi.fn(() => admin.id), readBody: vi.fn(() => ({ reason: 'self-ban test' })) }))

    const { default: handler } = await import('../server/api/admin/users/[id]/ban.post')
    await expectRejected(handler, { params: { id: admin.id } }, { statusCode: 403, statusMessage: 'CANNOT_BAN_SELF' })
    expect(dbMock).not.toHaveBeenCalled()
  })

  it('POST /api/admin/users/:id/unban rejects an admin trying to unban themselves', async () => {
    vi.resetModules()
    const admin = { id: '00000000-0000-0000-0000-000000000002' }
    const requireAdminMock = vi.fn().mockResolvedValue(admin)
    const dbMock = vi.fn(() => { throw new Error('database must not be reached') })
    vi.doMock('../server/utils/authorization', () => ({ requireAdmin: requireAdminMock }))
    vi.doMock('../server/utils/db', () => ({ getDb: () => dbMock }))
    vi.doMock('h3', () => ({ getRouterParam: vi.fn(() => admin.id) }))

    const { default: handler } = await import('../server/api/admin/users/[id]/unban.post')
    await expectRejected(handler, { params: { id: admin.id } }, { statusCode: 403, statusMessage: 'CANNOT_UNBAN_SELF' })
    expect(dbMock).not.toHaveBeenCalled()
  })
})
