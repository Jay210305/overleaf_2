import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { emailRequestSchema, passwordResetRequestSchema } from "@latex-collab/contracts";
import { writeAuditEvent, type DatabaseClient } from "@latex-collab/db";
import { AuthError, tokenHash } from "./errors.js";
import { normalizeEmail } from "./register.js";

const lifetimeMs = 60 * 60 * 1000;
export type SendPasswordReset = (email: string, token: string) => Promise<void>;

export async function requestPasswordReset(
  db: DatabaseClient,
  rawInput: unknown,
  sendPasswordReset: SendPasswordReset,
): Promise<void> {
  const input = rawInput as { email?: unknown } | null;
  const normalized = typeof input?.email === "string" ? normalizeEmail(input.email) : undefined;
  const parsed = emailRequestSchema.safeParse({ ...input, email: normalized });
  if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

  const token = randomBytes(32).toString("base64url");
  const issued = await db.transaction(async (tx) => {
    const found = await tx.query<{
      id: string;
      password_hash: string | null;
      email_verified_at: Date | null;
      disabled_at: Date | null;
    }>(
      "SELECT id, password_hash, email_verified_at, disabled_at FROM users WHERE email_normalized = $1 FOR UPDATE",
      [parsed.data.email],
    );
    const user = found.rows[0];
    if (!user?.password_hash || !user.email_verified_at || user.disabled_at) return null;
    await tx.query(
      "UPDATE verification_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL",
      [user.id],
    );
    await tx.query(
      "INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'password_reset', $2, $3)",
      [user.id, tokenHash(token), new Date(Date.now() + lifetimeMs)],
    );
    return user.id;
  });
  if (!issued) return;
  try {
    await sendPasswordReset(parsed.data.email, token);
  } catch {
    // The public response stays the same for known and unknown addresses.
    // An undelivered token is invalidated so a later request can retry.
    try {
      await db.query("DELETE FROM verification_tokens WHERE token_hash = $1 AND used_at IS NULL", [
        tokenHash(token),
      ]);
    } catch {
      // A stranded hash carries no usable secret and is still time limited.
    }
  }
}

export async function resetPassword(
  db: DatabaseClient,
  rawInput: unknown,
  requestId: string,
): Promise<void> {
  const parsed = passwordResetRequestSchema.safeParse(rawInput);
  if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
  // Reject token guesses before paying the Argon2 cost. The locked
  // transaction repeats every decision because state may change meanwhile.
  const candidate = await db.query<{
    expires_at: Date;
    used_at: Date | null;
    disabled_at: Date | null;
    email_verified_at: Date | null;
  }>(
    `SELECT vt.expires_at, vt.used_at, u.disabled_at, u.email_verified_at
     FROM verification_tokens vt JOIN users u ON u.id = vt.user_id
     WHERE vt.token_hash = $1 AND vt.purpose = 'password_reset'`,
    [tokenHash(parsed.data.token)],
  );
  const preliminary = candidate.rows[0];
  if (!preliminary || preliminary.used_at || preliminary.expires_at.getTime() <= Date.now())
    throw new AuthError(401, "RESET_EXPIRED");
  if (preliminary.disabled_at || !preliminary.email_verified_at)
    throw new AuthError(403, "ACCOUNT_DISABLED");
  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  await db.transaction(async (tx) => {
    const result = await tx.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
      disabled_at: Date | null;
      email_verified_at: Date | null;
    }>(
      `SELECT vt.id, vt.user_id, vt.expires_at, vt.used_at, u.disabled_at, u.email_verified_at
       FROM verification_tokens vt JOIN users u ON u.id = vt.user_id
       WHERE vt.token_hash = $1 AND vt.purpose = 'password_reset'
       FOR UPDATE OF vt, u`,
      [tokenHash(parsed.data.token)],
    );
    const row = result.rows[0];
    if (!row || row.used_at || row.expires_at.getTime() <= Date.now())
      throw new AuthError(401, "RESET_EXPIRED");
    if (row.disabled_at || !row.email_verified_at) throw new AuthError(403, "ACCOUNT_DISABLED");
    await tx.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      row.user_id,
    ]);
    await tx.query(
      "UPDATE verification_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL",
      [row.user_id],
    );
    const revoked = await tx.query<{ id: string }>(
      "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id",
      [row.user_id],
    );
    for (const session of revoked.rows)
      await writeAuditEvent(tx, {
        action: "session.revoked",
        actorId: row.user_id,
        targetId: session.id,
        requestId,
      });
  });
}
