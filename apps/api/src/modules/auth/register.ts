import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { registerRequestSchema, type RegisterRequest } from "@latex-collab/contracts";
import { DatabaseClient, PersistenceError } from "@latex-collab/db";
import { z } from "zod";
import { AuthError, tokenHash } from "./errors.js";

const inviteInput = z.object({ email: z.email(), displayName: z.string().min(1).max(200) });
const inviteLifetimeMs = 24 * 60 * 60 * 1000;
const verificationLifetimeMs = 24 * 60 * 60 * 1000;

export type SendVerification = (email: string, token: string) => Promise<void>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Only trusted operator code may call this function. It is never exposed as an HTTP route. */
export async function createTrustedRegistrationInvitation(
  db: DatabaseClient,
  email: string,
  displayName: string,
): Promise<string> {
  const normalized = normalizeEmail(email);
  if (!inviteInput.safeParse({ email: normalized, displayName }).success)
    throw new AuthError(400, "VALIDATION_ERROR");
  const token = randomBytes(32).toString("base64url");
  try {
    await db.transaction(async (tx) => {
      const existing = await tx.query<{
        id: string;
        password_hash: string | null;
        disabled_at: Date | null;
        email_verified_at: Date | null;
      }>(
        "SELECT id, password_hash, disabled_at, email_verified_at FROM users WHERE email_normalized = $1 FOR UPDATE",
        [normalized],
      );
      const account = existing.rows[0];
      if (account?.password_hash || account?.disabled_at || account?.email_verified_at)
        throw new AuthError(409, "ACCOUNT_CONFLICT");
      const userId =
        account?.id ??
        (
          await tx.query<{ id: string }>(
            "INSERT INTO users (email_normalized, display_name) VALUES ($1, $2) RETURNING id",
            [normalized, displayName],
          )
        ).rows[0]!.id;
      await tx.query(
        "DELETE FROM verification_tokens WHERE user_id = $1 AND purpose = 'registration_invite'",
        [userId],
      );
      await tx.query(
        "INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'registration_invite', $2, $3)",
        [userId, tokenHash(token), new Date(Date.now() + inviteLifetimeMs)],
      );
    });
  } catch (error) {
    if (error instanceof PersistenceError && error.code === "CONSTRAINT_VIOLATION")
      throw new AuthError(409, "ACCOUNT_CONFLICT");
    throw error;
  }
  return token;
}

export async function registerTrustedAccount(
  db: DatabaseClient,
  rawInput: unknown,
  invitation: string,
  sendVerification: SendVerification,
): Promise<void> {
  const body = rawInput as Partial<RegisterRequest> | null;
  const normalized = typeof body?.email === "string" ? normalizeEmail(body.email) : undefined;
  const parsed = registerRequestSchema.safeParse({ ...body, email: normalized });
  if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
  if (!invitation || invitation.length > 256) throw new AuthError(403, "REGISTRATION_DENIED");

  // Reject unauthenticated guesses before paying the Argon2 cost. The locked
  // transaction below repeats these checks because the invitation can change.
  const candidate = await db.query<{
    expires_at: Date;
    used_at: Date | null;
    email_normalized: string;
    disabled_at: Date | null;
    password_hash: string | null;
    email_verified_at: Date | null;
  }>(
    `SELECT vt.expires_at, vt.used_at, u.email_normalized, u.disabled_at, u.password_hash, u.email_verified_at
     FROM verification_tokens vt JOIN users u ON u.id = vt.user_id
     WHERE vt.token_hash = $1 AND vt.purpose = 'registration_invite'`,
    [tokenHash(invitation)],
  );
  const preliminary = candidate.rows[0];
  if (
    !preliminary ||
    preliminary.used_at ||
    preliminary.email_normalized !== normalized ||
    preliminary.disabled_at ||
    preliminary.email_verified_at
  )
    throw new AuthError(403, "REGISTRATION_DENIED");
  if (preliminary.expires_at.getTime() <= Date.now())
    throw new AuthError(401, "INVITATION_EXPIRED");
  if (preliminary.password_hash) throw new AuthError(409, "ACCOUNT_CONFLICT");

  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  const verificationToken = randomBytes(32).toString("base64url");
  const registered = await db.transaction(async (tx) => {
    const invite = await tx.query<{
      id: string;
      user_id: string;
      email_normalized: string;
      expires_at: Date;
      used_at: Date | null;
      disabled_at: Date | null;
      password_hash: string | null;
      email_verified_at: Date | null;
    }>(
      `SELECT vt.id, vt.user_id, vt.expires_at, vt.used_at,
              u.email_normalized, u.disabled_at, u.password_hash, u.email_verified_at
       FROM verification_tokens vt JOIN users u ON u.id = vt.user_id
       WHERE vt.token_hash = $1 AND vt.purpose = 'registration_invite'
       FOR UPDATE OF vt, u`,
      [tokenHash(invitation)],
    );
    const row = invite.rows[0];
    if (!row || row.used_at || row.email_normalized !== normalized)
      throw new AuthError(403, "REGISTRATION_DENIED");
    if (row.expires_at.getTime() <= Date.now()) throw new AuthError(401, "INVITATION_EXPIRED");
    if (row.disabled_at || row.email_verified_at) throw new AuthError(403, "REGISTRATION_DENIED");
    if (row.password_hash) throw new AuthError(409, "ACCOUNT_CONFLICT");
    await tx.query("UPDATE users SET password_hash = $1, display_name = $2 WHERE id = $3", [
      passwordHash,
      parsed.data.displayName,
      row.user_id,
    ]);
    await tx.query("UPDATE verification_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
    await tx.query(
      "INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'email_verify', $2, $3)",
      [row.user_id, tokenHash(verificationToken), new Date(Date.now() + verificationLifetimeMs)],
    );
    return { userId: row.user_id, inviteId: row.id };
  });
  try {
    await sendVerification(parsed.data.email, verificationToken);
  } catch {
    // SMTP can fail after the database commit. Restore the unused invitation
    // so the trusted user can retry, and invalidate the undelivered link.
    await db.transaction(async (tx) => {
      const user = await tx.query<{ email_verified_at: Date | null }>(
        "SELECT email_verified_at FROM users WHERE id = $1 FOR UPDATE",
        [registered.userId],
      );
      if (user.rows[0]?.email_verified_at) return;
      await tx.query("DELETE FROM verification_tokens WHERE token_hash = $1 AND used_at IS NULL", [
        tokenHash(verificationToken),
      ]);
      await tx.query("UPDATE users SET password_hash = NULL WHERE id = $1", [registered.userId]);
      await tx.query("UPDATE verification_tokens SET used_at = NULL WHERE id = $1", [
        registered.inviteId,
      ]);
    });
    throw new AuthError(502, "PROVIDER_UNAVAILABLE");
  }
}
