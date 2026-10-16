import argon2 from "argon2";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { deleteAccountRequestSchema } from "@latex-collab/contracts";
import { writeAuditEvent, type DatabaseClient } from "@latex-collab/db";
import { requireSession } from "../../plugins/require-session.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";
import { AuthError } from "../auth/errors.js";
import { expiredSessionCookie } from "../auth/session.js";

const absoluteMs = 30 * 24 * 60 * 60 * 1000;

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

export async function executeAccountDeletion(
  db: DatabaseClient,
  userId: string,
  sessionId: string,
  passwordToVerify: string,
  csrfToken: unknown,
  requestId: string,
): Promise<{ accepted: true; deleted: true }> {
  return db.transaction(async (tx) => {
    // 1. Lock user and session
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
      [sessionId, userId],
    );

    const row = found.rows[0];
    if (
      !row ||
      row.revoked_at ||
      row.expires_at.getTime() <= Date.now() ||
      row.created_at.getTime() + absoluteMs <= Date.now()
    ) {
      throw new AuthError(401, "AUTHENTICATION_REQUIRED");
    }
    if (row.disabled_at || !row.email_verified_at) {
      throw new AuthError(403, "ACCOUNT_DISABLED");
    }

    // 2. Validate CSRF
    requireSessionCsrf(csrfToken, row.csrf_hash);

    // 3. Verify password
    if (!row.password_hash || !(await argon2.verify(row.password_hash, passwordToVerify))) {
      throw new AuthError(403, "INVALID_CREDENTIALS");
    }

    // 4. Check shared ownership rules: user cannot delete account if they own any projects
    const ownedProjects = await tx.query<{ id: string; title: string }>(
      `SELECT id, title FROM projects WHERE owner_id = $1`,
      [userId],
    );
    if (ownedProjects.rows.length > 0) {
      throw new AuthError(409, "SOLE_OWNER_CONFLICT");
    }

    // 5. Remove memberships from projects owned by other users
    await tx.query(`DELETE FROM project_members WHERE user_id = $1`, [userId]);

    // 6. Cancel pending ownership transfer offers
    await tx.query(
      `UPDATE project_ownership_offers SET status = 'cancelled' WHERE recipient_user_id = $1 AND status = 'pending'`,
      [userId],
    );

    // 7. Remove user project tags
    await tx.query(`DELETE FROM project_tags WHERE user_id = $1`, [userId]);

    // 8. Invalidate verification/reset tokens
    await tx.query(
      `UPDATE verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );

    // 9. Revoke all user sessions
    const revoked = await tx.query<{ id: string }>(
      `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
      [userId],
    );
    for (const session of revoked.rows) {
      await writeAuditEvent(tx, {
        action: "session.revoked",
        actorId: userId,
        targetId: session.id,
        requestId,
      });
    }

    // 10. Mark user disabled/deleted to prevent further logins, retaining audit record
    await tx.query(`UPDATE users SET disabled_at = NOW() WHERE id = $1`, [userId]);

    // 11. Write audit log
    await writeAuditEvent(tx, {
      action: "account.deleted",
      actorId: userId,
      targetId: userId,
      requestId,
    });

    return { accepted: true, deleted: true };
  });
}

export function registerDeleteAccountRoute(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined; origin?: string | undefined; secureCookies: boolean },
): void {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const current = await requireSession(
        options.db,
        request,
        options.origin,
        options.secureCookies,
        true,
      );
      const parsed = deleteAccountRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

      const password = parsed.data.currentPassword ?? parsed.data.password!;
      const result = await executeAccountDeletion(
        options.db,
        current.userId,
        current.sessionId,
        password,
        request.headers["x-csrf-token"],
        request.id,
      );

      reply.header("set-cookie", expiredSessionCookie(options.secureCookies));
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  };

  app.post("/api/v1/me/delete", handler);
  app.delete("/api/v1/me", handler);
}
