import { getDb } from './db'

type SqlClient = ReturnType<typeof getDb>

type AuditInput = {
  actorId: string | null
  action: string
  targetId?: string | null
  metadata?: Record<string, unknown>
}

export async function writeAuditLog(input: AuditInput, client?: SqlClient) {
  const db = client ?? getDb()
  await db`
    INSERT INTO audit_logs (actor_id, action, target_id, metadata)
    VALUES (
      ${input.actorId},
      ${input.targetId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `
}
