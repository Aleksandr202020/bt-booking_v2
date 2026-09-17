import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) throw new Error('DATABASE_URL is required for schema integration tests')

const sql = postgres(databaseUrl, { prepare: false })

afterAll(async () => {
  await sql.end()
})

describe('PostgreSQL schema integrity', () => {
  it('enforces a direct foreign key from bookings.user_id to users.id', async () => {
    const rows = await sql`
      SELECT
        c.conname,
        pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'bookings'
        AND c.conname = 'bookings_user_fk'
    `

    expect(rows).toHaveLength(1)
    expect(String(rows[0].definition)).toContain('FOREIGN KEY (user_id)')
    expect(String(rows[0].definition)).toContain('REFERENCES users(id)')
  })
})
