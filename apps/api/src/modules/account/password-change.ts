import argon2 from "argon2";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { passwordChangeRequestSchema } from "@latex-collab/contracts";
import { writeAuditEvent, type DatabaseClient } from "@latex-collab/db";
import { requireSession } from "../../plugins/require-session.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";
import { AuthError } from "../auth/errors.js";

const absoluteMs = 30 * 24 * 60 * 60 * 1000;

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

export function registerPasswordChangeRoute(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined; origin?: string | undefined; secureCookies: boolean },
): void {
  app.post("/api/v1/me/password", async (request, reply) => {
    try {
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const current = await requireSession(
        options.db,
        request,
        options.origin,
        options.secureCookies,
        true,
      );
      const parsed = passwordChangeRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const newHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });
      await options.db.transaction(async (tx) => {
        const found = await tx.query<{
          password_hash: string | null;
          csrf_hash: string | null;
          expires_at: Date;
          created_at: Date;
          revoked_at: Date | null;
          disabled_at: Date | null;
          email_verified_at: Date | null;
        }>(
          `SELECT u.password_hash, s.csrf_hash, s.expires_at, s.created_at, s.revoked_at,
                  u.disabled_at, u.email_verified_at
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id = $1 AND s.user_id = $2 FOR UPDATE OF s, u`,
          [current.sessionId, current.userId],
        );
        const row = found.rows[0];
        if (
          !row ||
          row.revoked_at ||
          row.expires_at.getTime() <= Date.now() ||
          row.created_at.getTime() + absoluteMs <= Date.now()
        )
          throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        if (row.disabled_at || !row.email_verified_at) throw new AuthError(403, "ACCOUNT_DISABLED");
        requireSessionCsrf(request.headers["x-csrf-token"], row.csrf_hash);
        if (
          !row.password_hash ||
          !(await argon2.verify(row.password_hash, parsed.data.currentPassword))
        )
          throw new AuthError(403, "INVALID_CREDENTIALS");
        await tx.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
          newHash,
          current.userId,
        ]);
        await tx.query(
          "UPDATE verification_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL",
          [current.userId],
        );
        const revoked = await tx.query<{ id: string }>(
          "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL RETURNING id",
          [current.userId, current.sessionId],
        );
        for (const session of revoked.rows)
          await writeAuditEvent(tx, {
            action: "session.revoked",
            actorId: current.userId,
            targetId: session.id,
            requestId: request.id,
          });
      });
      return reply.code(200).send({ accepted: true });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
