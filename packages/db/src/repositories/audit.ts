import { assertUUID, PersistenceError, type TransactionContext, type UUID } from "../client.js";

export type AuditAction = "account.created" | "session.login" | "session.revoked";
export type AuditTarget = "user" | "session";

export interface AuditEventInput {
  action: AuditAction;
  actorId: UUID;
  targetId: UUID;
  requestId: UUID;
}

/** Persist an allowlisted event in the caller's mutation transaction. No request body or arbitrary metadata crosses this boundary. */
export async function writeAuditEvent(
  tx: TransactionContext,
  event: AuditEventInput,
): Promise<UUID> {
  assertUUID(event.actorId, "actorId");
  assertUUID(event.targetId, "targetId");
  assertUUID(event.requestId, "requestId");
  const targetType: AuditTarget = event.action === "account.created" ? "user" : "session";
  if (!["account.created", "session.login", "session.revoked"].includes(event.action))
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Unknown audit action", false);
  const result = await tx.query<{ id: string }>(
    `INSERT INTO audit_events (actor_id, action, target_type, target_id, metadata_redacted, request_id)
     VALUES ($1, $2, $3, $4, '{}'::jsonb, $5) RETURNING id`,
    [event.actorId, event.action, targetType, event.targetId, event.requestId],
  );
  return result.rows[0]!.id;
}
