import { createHash, randomBytes } from 'node:crypto'
import { hash, verify, Algorithm } from '@node-rs/argon2'

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
    algorithm: Algorithm.Argon2id,
  })
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(password, passwordHash)
  } catch {
    return false
  }
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const SESSION_COOKIE = 'bt_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
