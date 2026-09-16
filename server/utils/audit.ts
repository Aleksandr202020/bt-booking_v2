import { getDb } from './db'

export async function writeAuditLog(input: {
  actorId: string | null
  action: string
  targetId?: string | null
  metadata?: Record<string, unknown>
}) {
  const db = getDb()
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
