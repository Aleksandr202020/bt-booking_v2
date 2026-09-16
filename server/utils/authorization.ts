import type { H3Event } from 'h3'
import { getSessionUser } from './session'

export async function requireUser(event: H3Event) {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'AUTH_REQUIRED', data: { code: 'AUTH_REQUIRED' } })
  }
  return user
}

export async function requireAdmin(event: H3Event) {
  const user = await requireUser(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'FORBIDDEN', data: { code: 'FORBIDDEN' } })
  }
  return user
}

export async function requireUnbannedUser(event: H3Event) {
  const user = await requireUser(event)
  if (user.banned) {
    throw createError({ statusCode: 403, statusMessage: 'CLIENT_BANNED', data: { code: 'CLIENT_BANNED' } })
  }
  return user
}
