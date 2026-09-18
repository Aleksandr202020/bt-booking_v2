import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for database email constraint tests')
const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
let firstId: string

beforeAll(async () => {
  const [row] = await sql`
    INSERT INTO users (name, email, phone, password_hash)
    VALUES ('Email Constraint Test', ${`email-ci-${suffix}@example.test`}, '+37100000090', 'test-only-hash')
    RETURNING id
  `
  firstId = row.id
})

afterAll(async () => {
  await sql`DELETE FROM users WHERE id = ${firstId}`
  await sql.end()
})

describe('database email constraints', () => {
  it('enforces case-insensitive user email uniqueness', async () => {
    await expect(sql`
      INSERT INTO users (name, email, phone, password_hash)
      VALUES ('Email Constraint Duplicate', ${`EMAIL-CI-${suffix.toUpperCase()}@EXAMPLE.TEST`}, '+37100000091', 'test-only-hash')
    `).rejects.toMatchObject({ code: '23505', constraint_name: 'users_email_ci_idx' })
  })
})
