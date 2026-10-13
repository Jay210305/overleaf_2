import type { DatabaseClient, TransactionContext } from "@latex-collab/db";
import type { Role } from "@latex-collab/contracts";
import { AuthError } from "../auth/errors.js";
import { parseIfMatch } from "../projects/validation.js";

/**
 * Validates If-Match ETag against numeric entity revision.
 * Throws 412 PRECONDITION_FAILED if mismatch.
 */
export function validateIfMatchHeader(
  ifMatchHeader: string | undefined,
  currentRevision: number,
): void {
  if (ifMatchHeader === undefined) return;
  const expectedRev = parseIfMatch(ifMatchHeader);
  if (expectedRev !== null && expectedRev !== currentRevision) {
    throw new AuthError(412, "PRECONDITION_FAILED");
  }
}

/**
 * Acquires an exclusive row lock on project revision and validates If-Match concurrency header.
 * Returns the locked current_revision.
 */
export async function checkMetadataConcurrency(
  client: DatabaseClient | TransactionContext,
  projectId: string,
  ifMatchHeader?: string,
): Promise<number> {
  const res = await client.query<{ current_revision: number }>(
    `SELECT current_revision FROM projects WHERE id = $1 FOR UPDATE`,
    [projectId],
  );
  const proj = res.rows[0];
  if (!proj) {
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  }

  const currentRevision = Number(proj.current_revision);
  validateIfMatchHeader(ifMatchHeader, currentRevision);
  return currentRevision;
}

/**
 * Validates optimistic CRDT state vector base match for text edits.
 * Throws 409 REVISION_CONFLICT if client edit is built on a stale state vector.
 */
export function checkTextRevisionConcurrency(
  currentStateVectorBase64: string,
  incomingBaseStateVectorBase64: string,
): void {
  if (currentStateVectorBase64 !== incomingBaseStateVectorBase64) {
    throw new AuthError(409, "REVISION_CONFLICT");
  }
}

/**
 * Enforces role-based authorization for edit actions.
 * VIEWER and REVIEWER are denied with 403 PROJECT_PERMISSION_DENIED.
 */
export function assertCanEditProject(role: Role): void {
  if (role === "VIEWER" || role === "REVIEWER") {
    throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
  }
}
