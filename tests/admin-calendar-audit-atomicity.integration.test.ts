import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeAuditLog } from '../server/utils/audit'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for admin calendar audit atomicity tests')

const sql = postgres(databaseUrl, { prepare: false })
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const invalidAuditActorId = '00000000-0000-0000-0000-000000000000'
let adminId: string

function addDaysIso(days: number) {
  const date = new Date()
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const baseDate = addDaysIso(12)

beforeAll(async () => {
  const [admin] = await sql`
    INSERT INTO users (name, email, phone, password_hash, role)
    VALUES ('Calendar Audit Atomicity Test', ${`calendar-audit-${suffix}@example.test`}, '+37100000010', 'test-only-hash', 'admin')
    RETURNING id
  `
  adminId = admin.id
})

afterAll(async () => {
  if (adminId) {
    await sql`DELETE FROM audit_logs WHERE actor_id = ${adminId}`
    await sql`DELETE FROM blocked_slots WHERE created_by = ${adminId}`
    await sql`DELETE FROM holidays WHERE name LIKE ${`Calendar audit atomicity ${suffix}%`}`
    await sql`DELETE FROM users WHERE id = ${adminId}`
  }
  await sql.end()
})

describe('admin calendar audit atomicity', () => {
  it('rolls back blocked-slot creation when its audit insert fails', async () => {
    const reason = `Calendar audit atomicity ${suffix} block-create`

    await expect(sql.begin(async (tx) => {
      const [row] = await tx`
        INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
        VALUES (${baseDate}, '17:00', ${reason}, ${adminId})
        RETURNING id, booking_date, booking_time, reason
      `

      await writeAuditLog({
        actorId: invalidAuditActorId,
        action: 'blocked_slot.created',
        targetId: row.id,
        metadata: row,
      }, tx)
    })).rejects.toBeDefined()

    const rows = await sql`
      SELECT id FROM blocked_slots
      WHERE created_by = ${adminId} AND reason = ${reason}
    `
    expect(rows).toHaveLength(0)
  })

  it('rolls back holiday creation when its audit insert fails', async () => {
    const name = `Calendar audit atomicity ${suffix} holiday-create`
    const date = addDaysIso(13)

    await expect(sql.begin(async (tx) => {
      const [row] = await tx`
        INSERT INTO holidays (date, name, active)
        VALUES (${date}, ${name}, TRUE)
        RETURNING id, date, name, active
      `

      await writeAuditLog({
        actorId: invalidAuditActorId,
        action: 'holiday.created',
        targetId: row.id,
        metadata: row,
      }, tx)
    })).rejects.toBeDefined()

    const rows = await sql`
      SELECT id FROM holidays WHERE date = ${date} AND name = ${name}
    `
    expect(rows).toHaveLength(0)
  })

  it('rolls back blocked-slot deletion when its audit insert fails', async () => {
    const reason = `Calendar audit atomicity ${suffix} block-delete`
    const [created] = await sql`
      INSERT INTO blocked_slots (booking_date, booking_time, reason, created_by)
      VALUES (${addDaysIso(14)}, '18:00', ${reason}, ${adminId})
      RETURNING id
    `

    await expect(sql.begin(async (tx) => {
      const [row] = await tx`
        DELETE FROM blocked_slots WHERE id = ${created.id}
        RETURNING id, booking_date, booking_time, reason
      `

      await writeAuditLog({
        actorId: invalidAuditActorId,
        action: 'blocked_slot.deleted',
        targetId: row.id,
        metadata: row,
      }, tx)
    })).rejects.toBeDefined()

    const rows = await sql`
      SELECT id FROM blocked_slots WHERE id = ${created.id}
    `
    expect(rows).toHaveLength(1)
  })

  it('rolls back holiday deletion when its audit insert fails', async () => {
    const name = `Calendar audit atomicity ${suffix} holiday-delete`
    const [created] = await sql`
      INSERT INTO holidays (date, name, active)
      VALUES (${addDaysIso(15)}, ${name}, TRUE)
      RETURNING id
    `

    await expect(sql.begin(async (tx) => {
      const [row] = await tx`
        DELETE FROM holidays WHERE id = ${created.id}
        RETURNING id, date, name
      `

      await writeAuditLog({
        actorId: invalidAuditActorId,
        action: 'holiday.deleted',
        targetId: row.id,
        metadata: row,
      }, tx)
    })).rejects.toBeDefined()

    const rows = await sql`
      SELECT id FROM holidays WHERE id = ${created.id}
    `
    expect(rows).toHaveLength(1)
  })
})
