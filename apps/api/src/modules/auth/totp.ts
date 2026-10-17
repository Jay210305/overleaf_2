import { randomBytes } from "node:crypto";
import { writeAuditEvent, type DatabaseClient } from "@latex-collab/db";
import { AuthError } from "./errors.js";
import {
  ensureUserMfaTable,
  fromBase32,
  verifyTotpCode,
} from "./mfa.js";
import { decryptCredential } from "../integrations/connections.js";

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(randomBytes(5).toString("hex"));
  }
  return codes;
}

export async function isUserMfaActive(db: DatabaseClient, userId: string): Promise<boolean> {
  await ensureUserMfaTable(db);
  const res = await db.query<{ verified_at: Date | null }>(
    "SELECT verified_at FROM user_mfa WHERE user_id = $1",
    [userId],
  );
  return Boolean(res.rows[0]?.verified_at);
}

/**
 * Validates a TOTP code or a single-use recovery code.
 * If a recovery code is used, it is atomically removed from the database
 * so it cannot be reused (one-use recovery).
 */
export async function verifyTotpChallenge(
  db: DatabaseClient,
  userId: string,
  code: string,
): Promise<{ valid: boolean; usedRecoveryCode: boolean }> {
  await ensureUserMfaTable(db);
  const res = await db.query<{
    secret_encrypted: string;
    verified_at: Date | null;
    recovery_codes_json: string[];
  }>("SELECT secret_encrypted, verified_at, recovery_codes_json FROM user_mfa WHERE user_id = $1", [
    userId,
  ]);

  const mfa = res.rows[0];
  if (!mfa || !mfa.verified_at) {
    return { valid: false, usedRecoveryCode: false };
  }

  // 1. Try TOTP code check
  let totpValid = false;
  try {
    const base32 = decryptCredential(mfa.secret_encrypted);
    const secretBuf = fromBase32(base32);
    totpValid = verifyTotpCode(secretBuf, code);
  } catch {
    totpValid = false;
  }

  if (totpValid) {
    return { valid: true, usedRecoveryCode: false };
  }

  // 2. Try single-use recovery code
  const recoveryCodes = Array.isArray(mfa.recovery_codes_json) ? mfa.recovery_codes_json : [];
  const codeIndex = recoveryCodes.indexOf(code);
  if (codeIndex !== -1) {
    // Atomically consume recovery code
    const updatedCodes = [...recoveryCodes];
    updatedCodes.splice(codeIndex, 1);
    await db.query(
      "UPDATE user_mfa SET recovery_codes_json = $1, updated_at = NOW() WHERE user_id = $2",
      [JSON.stringify(updatedCodes), userId],
    );
    return { valid: true, usedRecoveryCode: true };
  }

  return { valid: false, usedRecoveryCode: false };
}

/**
 * Enforces MFA challenge policy during account login.
 * Throws MFA_CODE_REQUIRED if MFA is enabled and no code was supplied.
 * Throws INVALID_MFA_CODE if the code is invalid.
 */
export async function challengeMfaLogin(
  db: DatabaseClient,
  userId: string,
  code?: string,
): Promise<void> {
  const active = await isUserMfaActive(db, userId);
  if (!active) return;

  if (!code) {
    throw new AuthError(403, "MFA_CODE_REQUIRED");
  }

  const result = await verifyTotpChallenge(db, userId, code);
  if (!result.valid) {
    throw new AuthError(403, "INVALID_MFA_CODE");
  }
}

/**
 * Disables MFA requiring a valid challenge (code) and revoking affected sessions.
 */
export async function disableMfaWithChallenge(
  db: DatabaseClient,
  userId: string,
  currentSessionId: string,
  challengeCode: string,
  requestId: string,
): Promise<void> {
  const check = await verifyTotpChallenge(db, userId, challengeCode);
  if (!check.valid) {
    throw new AuthError(403, "INVALID_MFA_CODE");
  }

  await db.transaction(async (tx) => {
    await tx.query("DELETE FROM user_mfa WHERE user_id = $1", [userId]);
    const revoked = await tx.query<{ id: string }>(
      "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL RETURNING id",
      [userId, currentSessionId],
    );
    for (const s of revoked.rows) {
      await writeAuditEvent(tx, {
        action: "session.revoked",
        actorId: userId,
        targetId: s.id,
        requestId,
      });
    }
  });
}
