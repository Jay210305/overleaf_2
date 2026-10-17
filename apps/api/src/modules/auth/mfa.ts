import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  mfaRequestSchema,
  mfaSetupViewSchema,
  type MfaSetupView,
} from "@latex-collab/contracts";
import { writeAuditEvent, type DatabaseClient } from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";
import { requireSession } from "../../plugins/require-session.js";
import { AuthError } from "./errors.js";
import { encryptCredential, decryptCredential } from "../integrations/connections.js";

// RFC 4648 Base32 alphabet
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function toBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function fromBase32(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]!);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(
  secretBuffer: Buffer,
  timeStep: number = Math.floor(Date.now() / 1000 / 30),
): string {
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(timeStep), 0);
  const hmac = createHmac("sha1", secretBuffer).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

export function verifyTotpCode(secretBuffer: Buffer, code: string, window = 1): boolean {
  if (!/^[0-9]{6}$/.test(code)) return false;
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    if (generateTotpCode(secretBuffer, currentStep + i) === code) {
      return true;
    }
  }
  return false;
}

export interface PendingMfaSetup {
  userId: string;
  secret: Buffer;
  base32Secret: string;
  expiresAt: number;
}

const pendingMfaSetups = new Map<string, PendingMfaSetup>();

export function clearPendingMfaSetups(): void {
  pendingMfaSetups.clear();
}

export function getPendingMfaSetup(setupId: string): PendingMfaSetup | undefined {
  return pendingMfaSetups.get(setupId);
}

export function setPendingMfaSetup(setupId: string, setup: PendingMfaSetup): void {
  pendingMfaSetups.set(setupId, setup);
}

export async function ensureUserMfaTable(db: DatabaseClient): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_mfa (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret_encrypted TEXT NOT NULL,
      verified_at TIMESTAMPTZ,
      recovery_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function isMfaEnabledForUser(db: DatabaseClient, userId: string): Promise<boolean> {
  await ensureUserMfaTable(db);
  const res = await db.query<{ verified_at: Date | null }>(
    "SELECT verified_at FROM user_mfa WHERE user_id = $1",
    [userId],
  );
  return Boolean(res.rows[0]?.verified_at);
}

export interface MfaRoutesOptions {
  db?: DatabaseClient | undefined;
  origin?: string | undefined;
  secureCookies?: boolean | undefined;
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

export function registerMfaRoutes(app: FastifyInstance, options: MfaRoutesOptions): void {
  const secureCookies = options.secureCookies ?? options.origin?.startsWith("https://") ?? false;

  // POST /api/v1/me/mfa/setup
  app.post("/api/v1/me/mfa/setup", async (request, reply) => {
    try {
      if (!options.db) return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
      const identity = await requireSession(options.db, request, options.origin, secureCookies, true);

      const userRes = await options.db.query<{ email_normalized: string }>(
        "SELECT email_normalized FROM users WHERE id = $1",
        [identity.userId],
      );
      const user = userRes.rows[0];
      if (!user) return reject(reply, request, new AuthError(404, "RESOURCE_NOT_FOUND"));

      const secret = randomBytes(20);
      const base32Secret = toBase32(secret);
      const setupId = randomUUID();

      pendingMfaSetups.set(setupId, {
        userId: identity.userId,
        secret,
        base32Secret,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const otpauthUri = `otpauth://totp/LaTeX%20Collab:${encodeURIComponent(
        user.email_normalized,
      )}?secret=${base32Secret}&issuer=LaTeX%20Collab&algorithm=SHA1&digits=6&period=30`;

      const view: MfaSetupView = {
        setupId,
        otpauthUri,
      };
      return mfaSetupViewSchema.parse(view);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  // POST /api/v1/me/mfa/confirm
  app.post("/api/v1/me/mfa/confirm", async (request, reply) => {
    try {
      if (!options.db) return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
      const identity = await requireSession(options.db, request, options.origin, secureCookies, true);

      const parsed = mfaRequestSchema.safeParse(request.body);
      if (!parsed.success || !parsed.data.setupId) {
        return reject(reply, request, new AuthError(400, "VALIDATION_ERROR"));
      }

      const { setupId, code } = parsed.data;
      const pending = pendingMfaSetups.get(setupId);
      if (!pending || pending.expiresAt <= Date.now() || pending.userId !== identity.userId) {
        pendingMfaSetups.delete(setupId);
        return reject(reply, request, new AuthError(400, "INVALID_MFA_SETUP"));
      }

      const valid = verifyTotpCode(pending.secret, code);
      if (!valid) {
        return reject(reply, request, new AuthError(400, "INVALID_MFA_CODE"));
      }

      pendingMfaSetups.delete(setupId);

      // Generate 8 one-time recovery codes (10 hex characters each)
      const recoveryCodes: string[] = [];
      for (let i = 0; i < 8; i++) {
        recoveryCodes.push(randomBytes(5).toString("hex"));
      }

      await ensureUserMfaTable(options.db);
      const encryptedSecret = encryptCredential(pending.base32Secret);

      await options.db.query(
        `INSERT INTO user_mfa (user_id, secret_encrypted, verified_at, recovery_codes_json, updated_at)
         VALUES ($1, $2, NOW(), $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           secret_encrypted = $2,
           verified_at = NOW(),
           recovery_codes_json = $3,
           updated_at = NOW()`,
        [identity.userId, encryptedSecret, JSON.stringify(recoveryCodes)],
      );

      return reply.code(200).send({
        accepted: true,
        recoveryCodes,
      });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  // DELETE /api/v1/me/mfa
  app.delete("/api/v1/me/mfa", async (request, reply) => {
    try {
      if (!options.db) return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
      const identity = await requireSession(options.db, request, options.origin, secureCookies, true);

      await ensureUserMfaTable(options.db);
      const mfaRow = await options.db.query<{
        secret_encrypted: string;
        verified_at: Date | null;
        recovery_codes_json: string[];
      }>("SELECT secret_encrypted, verified_at, recovery_codes_json FROM user_mfa WHERE user_id = $1", [
        identity.userId,
      ]);

      const mfa = mfaRow.rows[0];
      if (!mfa || !mfa.verified_at) {
        return reject(reply, request, new AuthError(404, "RESOURCE_NOT_FOUND"));
      }

      // Require valid code in body to disable MFA
      const body = request.body as Record<string, unknown> | null;
      const code = typeof body?.code === "string" ? body.code : undefined;
      if (!code) {
        return reject(reply, request, new AuthError(400, "VALIDATION_ERROR"));
      }

      let codeMatches = false;
      try {
        const base32Secret = decryptCredential(mfa.secret_encrypted);
        const secretBuf = fromBase32(base32Secret);
        codeMatches = verifyTotpCode(secretBuf, code);
      } catch {
        // Decrypt error
      }

      // Check recovery codes if TOTP did not match
      if (!codeMatches && Array.isArray(mfa.recovery_codes_json)) {
        if (mfa.recovery_codes_json.includes(code)) {
          codeMatches = true;
        }
      }

      if (!codeMatches) {
        return reject(reply, request, new AuthError(403, "INVALID_MFA_CODE"));
      }

      await options.db.transaction(async (tx) => {
        await tx.query("DELETE FROM user_mfa WHERE user_id = $1", [identity.userId]);
        // Revoke all other sessions for this user upon disabling MFA
        const revoked = await tx.query<{ id: string }>(
          "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL RETURNING id",
          [identity.userId, identity.sessionId],
        );
        for (const s of revoked.rows) {
          await writeAuditEvent(tx, {
            action: "session.revoked",
            actorId: identity.userId,
            targetId: s.id,
            requestId: request.id,
          });
        }
      });

      return reply.code(204).send();
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
