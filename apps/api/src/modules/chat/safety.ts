import { AuthError } from "../auth/errors.js";
import type { TransactionContext } from "@latex-collab/db";
import { assertSafeBody } from "../comments/safety.js";

/** Flood guard: messages per author per project inside the sliding window. */
export const CHAT_CREATE_LIMIT = 30;
export const CHAT_CREATE_WINDOW_SECONDS = 60;

/** Rejects oversized or executable chat bodies with 400; safe content passes untouched. */
export function assertChatBody(body: string): void {
  assertSafeBody(body);
}

export async function checkChatRateLimit(
  tx: TransactionContext,
  input: { projectId: string; userId: string },
): Promise<void> {
  const found = await tx.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM chat_messages
     WHERE project_id = $1 AND author_id = $2::uuid AND deleted_at IS NULL
       AND created_at > NOW() - ($3 || ' seconds')::interval`,
    [input.projectId, input.userId, CHAT_CREATE_WINDOW_SECONDS],
  );
  if (Number(found.rows[0]?.count ?? "0") >= CHAT_CREATE_LIMIT)
    throw new AuthError(429, "RATE_LIMITED");
}
