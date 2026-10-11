import { DatabaseClient } from "@latex-collab/db";
import { AuthError, tokenHash } from "./errors.js";

export async function verifyEmail(db: DatabaseClient, token: unknown): Promise<void> {
  if (typeof token !== "string" || token.length < 32 || token.length > 256)
    throw new AuthError(400, "VALIDATION_ERROR");
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
       WHERE vt.token_hash = $1 AND vt.purpose = 'email_verify'
       FOR UPDATE OF vt, u`,
      [tokenHash(token)],
    );
    const row = result.rows[0];
    if (!row || row.used_at || row.expires_at.getTime() <= Date.now())
      throw new AuthError(401, "VERIFICATION_EXPIRED");
    if (row.disabled_at) throw new AuthError(403, "ACCOUNT_DISABLED");
    if (row.email_verified_at) throw new AuthError(409, "ACCOUNT_CONFLICT");
    await tx.query("UPDATE users SET email_verified_at = NOW() WHERE id = $1", [row.user_id]);
    await tx.query("UPDATE verification_tokens SET used_at = NOW() WHERE id = $1", [row.id]);
  });
}
