import { getDb } from './db'

type AuditInput = {
  actorId: string | null
  action: string
  targetId?: string | null
  metadata?: Record<string, unknown>
}

// Pass the transaction client for audit entries that must commit or roll back
// together with the business mutation. Without it, an audit row could commit
// even when the surrounding transaction is rolled back.
export async function writeAuditLog(input: AuditInput, client?: any) {
  const db = client ?? getDb()
  await db`
    INSERT INTO audit_logs (actor_id, action, target_id, metadata)
    VALUES (
      ${input.actorId},
      ${input.action},
      ${input.targetId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `
}
