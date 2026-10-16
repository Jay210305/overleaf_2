import { AuthError } from "../auth/errors.js";
import type { TransactionContext } from "@latex-collab/db";

/** Shared body cap with the comment/chat Zod schemas; enforced again server-side. */
export const MAX_BODY_LENGTH = 10_000;
/** Flood guard: creations per author per project inside the sliding window. */
export const COMMENT_CREATE_LIMIT = 30;
export const COMMENT_CREATE_WINDOW_SECONDS = 300;

const FORBIDDEN_TAG = /<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|select|textarea|link|meta|base|frame|frameset|applet)\b/i;
const EVENT_HANDLER_ATTR = /<[^>]*\bon[a-z]+\s*=/i;
const DANGEROUS_URL_ATTR = /<[^>]*(?:href|src|xlink:href)\s*=\s*["']?\s*(javascript|data|vbscript)\s*:/i;
const MARKDOWN_UNSAFE_DESTINATION = /\[[^\]]*\]\(\s*<?\s*(javascript|data|vbscript)\s*:/i;
const REFERENCE_DEFINITION = /^\s*\[[^\]]+\]\s*:\s*(javascript|data|vbscript)\s*:/im;

/**
 * Reports whether a comment/chat body carries an executable payload.
 * Plain comparisons (`a < b`), safe Markdown and LaTeX math never match;
 * only tag, attribute and URL-scheme vectors are flagged.
 */
export function containsUnsafeMarkdown(body: string): boolean {
  return (
    body.includes(String.fromCharCode(0)) ||
    FORBIDDEN_TAG.test(body) ||
    EVENT_HANDLER_ATTR.test(body) ||
    DANGEROUS_URL_ATTR.test(body) ||
    MARKDOWN_UNSAFE_DESTINATION.test(body) ||
    REFERENCE_DEFINITION.test(body)
  );
}

/** Rejects oversized or executable bodies with 400; safe content passes untouched. */
export function assertSafeBody(body: string): void {
  if (body.length > MAX_BODY_LENGTH) throw new AuthError(400, "VALIDATION_ERROR");
  if (containsUnsafeMarkdown(body)) throw new AuthError(400, "VALIDATION_ERROR");
}

/** Enforces the writer role boundary; non-members are handled as 404 by callers. */
export function assertWriterRole(role: string | null, isOwner: boolean): void {
  if (isOwner || role === "OWNER" || role === "EDITOR" || role === "REVIEWER") return;
  throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
}

export async function checkCommentCreationRate(
  tx: TransactionContext,
  input: { projectId: string; userId: string },
): Promise<void> {
  const found = await tx.query<{ total: string }>(
    `SELECT (
       (SELECT COUNT(*) FROM comments WHERE project_id = $1 AND created_by = $2
        AND created_at > NOW() - ($3 || ' seconds')::interval)
       + (SELECT COUNT(*) FROM comment_replies r JOIN comments c ON c.id = r.comment_id
          WHERE c.project_id = $1 AND r.author_id = $2::uuid AND r.deleted_at IS NULL
          AND r.created_at > NOW() - ($3 || ' seconds')::interval)
     )::text AS total`,
    [input.projectId, input.userId, COMMENT_CREATE_WINDOW_SECONDS],
  );
  if (Number(found.rows[0]?.total ?? "0") >= COMMENT_CREATE_LIMIT)
    throw new AuthError(429, "RATE_LIMITED");
}
