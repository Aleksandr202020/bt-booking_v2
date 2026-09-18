import { getCookie, setCookie, deleteCookie } from 'h3'
import type { H3Event } from 'h3'
import { getDb } from './db'
import {
  createSessionToken,
  hashSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '../domain/auth/auth'

export async function createSession(event: H3Event, userId: string) {
  const token = createSessionToken()
  const tokenHash = hashSessionToken(token)
  const db = getDb()

  await db.begin(async (tx) => {
    // Remove only this user's expired sessions while preserving active sessions
    // on other devices. This bounds stale session accumulation without changing
    // the active-session model.
    await tx`DELETE FROM sessions WHERE user_id = ${userId} AND expires_at <= now()`
    await tx`
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES (${userId}, ${tokenHash}, now() + (${SESSION_TTL_SECONDS} * interval '1 second'))
    `
  })

  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function getSessionUser(event: H3Event) {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null

  const db = getDb()
  const tokenHash = hashSessionToken(token)
  const rows = await db`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.banned, u.ban_reason, u.banned_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > now()
    LIMIT 1
  `

  return rows[0] ?? null
}

export async function destroySession(event: H3Event) {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    const db = getDb()
    await db`DELETE FROM sessions WHERE token_hash = ${hashSessionToken(token)}`
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}
