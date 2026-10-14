import type { CompileStatus } from "@latex-collab/contracts";
import type { DatabaseClient } from "@latex-collab/db";

export class InvalidStatusTransitionError extends Error {
  readonly code = "INVALID_STATUS_TRANSITION" as const;
  readonly status = 400 as const;

  constructor(from: CompileStatus, to: CompileStatus) {
    super(`Invalid compile job status transition from '${from}' to '${to}'`);
    this.name = "InvalidStatusTransitionError";
  }
}

const ALLOWED_TRANSITIONS: Readonly<Record<CompileStatus, ReadonlySet<CompileStatus>>> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set(["succeeded", "failed", "timed_out", "cancel_requested"]),
  cancel_requested: new Set(["cancelled", "succeeded", "failed", "timed_out"]),
  succeeded: new Set(),
  failed: new Set(),
  timed_out: new Set(),
  cancelled: new Set(),
};

/**
 * Validates compile status transition conforming to Compilation Contract (S06-T14, CMP-04).
 * Allowed transitions:
 * queued -> running | cancelled
 * running -> succeeded | failed | timed_out | cancel_requested
 * cancel_requested -> cancelled | succeeded | failed | timed_out (if already finished)
 * Terminal states cannot transition further.
 */
export function assertValidStatusTransition(
  from: CompileStatus,
  to: CompileStatus,
): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.has(to)) {
    throw new InvalidStatusTransitionError(from, to);
  }
}

/**
 * Reconciles expired worker leases and dead processes after queue or worker crash (S06-T14, CMP-04, NFR-07).
 * - Jobs in 'cancel_requested' whose lease expired are finalized to 'cancelled'.
 * - Jobs in 'running' whose lease expired and attempts >= 3 are marked 'timed_out'.
 * - Jobs in 'running' whose lease expired and attempts < 3 can be reclaimed for retry without changing job ID.
 */
export async function reconcileExpiredLeases(
  db: DatabaseClient,
  options: { now?: Date; maxAttempts?: number } = {},
): Promise<{ timedOut: number; cancelled: number }> {
  const now = options.now ?? new Date();

  // 1. Finalize cancel_requested jobs whose lease expired
  const cancelRes = await db.query(
    `UPDATE compile_jobs
     SET status = 'cancelled',
         finished_at = $1,
         error_code = 'CANCELLED',
         lease_expires_at = NULL,
         updated_at = $1
     WHERE status = 'cancel_requested'
       AND (lease_expires_at IS NULL OR lease_expires_at < $1)`,
    [now],
  );

  // 2. Mark running jobs with expired leases and attempts >= maxAttempts as timed_out
  const maxAttempts = options.maxAttempts ?? 3;
  const timeOutRes = await db.query(
    `UPDATE compile_jobs
     SET status = 'timed_out',
         finished_at = $1,
         error_code = 'TIMEOUT',
         lease_expires_at = NULL,
         updated_at = $1
     WHERE status = 'running'
       AND lease_expires_at < $1
       AND attempts >= $2`,
    [now, maxAttempts],
  );

  return {
    cancelled: cancelRes.rowCount ?? 0,
    timedOut: timeOutRes.rowCount ?? 0,
  };
}
