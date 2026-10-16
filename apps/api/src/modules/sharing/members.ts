import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  sharingMemberListQuerySchema,
  sharingMemberPageSchema,
  sharingMemberRolePatchSchema,
  sharingMemberViewSchema,
  type SharingMemberView,
} from "@latex-collab/contracts";
import { isUUID, type DatabaseClient, type TransactionContext } from "@latex-collab/db";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";
import { type ProjectAuthorization } from "../../plugins/require-session.js";
import { AuthError } from "../auth/errors.js";
import {
  noopCollabInvalidationPublisher,
  type CollabInvalidationPublisher,
} from "../collab/invalidation.js";

interface MemberRow {
  user_id: string;
  display_name: string;
  role: "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER";
  revoked_at: Date | null;
}

function view(row: MemberRow): SharingMemberView {
  return sharingMemberViewSchema.parse({
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  });
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

async function lockOwner(
  tx: TransactionContext,
  auth: ProjectAuthorization,
  csrf: unknown,
): Promise<void> {
  const project = await tx.query<{ owner_id: string; status: string }>(
    "SELECT owner_id, status FROM projects WHERE id = $1 FOR UPDATE",
    [auth.projectId],
  );
  if (!project.rows[0] || project.rows[0].status !== "active")
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  if (project.rows[0].owner_id !== auth.userId)
    throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
  const actor = await tx.query<{
    csrf_hash: string | null;
    revoked_at: Date | null;
    expires_at: Date;
    created_at: Date;
    disabled_at: Date | null;
    email_verified_at: Date | null;
  }>(
    `SELECT s.csrf_hash, s.revoked_at, s.expires_at, s.created_at,
            u.disabled_at, u.email_verified_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2 FOR UPDATE OF s, u`,
    [auth.sessionId, auth.userId],
  );
  const current = actor.rows[0];
  if (
    !current ||
    current.revoked_at ||
    current.expires_at.getTime() <= Date.now() ||
    current.created_at.getTime() + 30 * 24 * 60 * 60 * 1000 <= Date.now()
  )
    throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  if (current.disabled_at || !current.email_verified_at)
    throw new AuthError(403, "ACCOUNT_DISABLED");
  requireSessionCsrf(csrf, current.csrf_hash);
}

async function lockActiveMember(tx: TransactionContext, projectId: string, userId: string) {
  const result = await tx.query<{
    role: "EDITOR" | "REVIEWER" | "VIEWER";
    revoked_at: Date | null;
    source_share_link_id: string | null;
    link_project_id: string | null;
    link_role: string | null;
    link_revoked_at: Date | null;
    link_expires_at: Date | null;
  }>(
    `SELECT pm.role, pm.revoked_at, pm.source_share_link_id,
            sl.project_id AS link_project_id, sl.role AS link_role,
            sl.revoked_at AS link_revoked_at, sl.expires_at AS link_expires_at
     FROM project_members pm
     LEFT JOIN share_links sl ON sl.id = pm.source_share_link_id
     WHERE pm.project_id = $1 AND pm.user_id = $2 FOR UPDATE OF pm`,
    [projectId, userId],
  );
  const member = result.rows[0];
  if (
    !member ||
    member.revoked_at ||
    (member.source_share_link_id &&
      (member.link_project_id !== projectId ||
        member.link_role !== member.role ||
        member.link_revoked_at ||
        !member.link_expires_at ||
        member.link_expires_at.getTime() <= Date.now()))
  )
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  return member;
}

export function registerProjectMemberRoutes(
  app: FastifyInstance,
  options: { db: DatabaseClient; collabInvalidation?: CollabInvalidationPublisher | undefined },
): void {
  const { db } = options;
  const publish = options.collabInvalidation ?? noopCollabInvalidationPublisher();
  const path = "/api/v1/projects/:projectId/members";
  const ownerOnly = { config: { projectAction: "MANAGE_MEMBERS" } } as const;

  app.get(path, { config: { projectAction: "READ" } }, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const parsed = sharingMemberListQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const result = await db.query<MemberRow>(
        `SELECT user_id, display_name, role, revoked_at FROM (
           SELECT p.owner_id AS user_id, u.display_name,
                  'OWNER'::text AS role, NULL::timestamptz AS revoked_at
           FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = $1
           UNION ALL
           SELECT pm.user_id, u.display_name, pm.role, pm.revoked_at
           FROM active_project_members pm JOIN users u ON u.id = pm.user_id
           WHERE pm.project_id = $1 AND pm.user_id <> (SELECT owner_id FROM projects WHERE id = $1)
         ) members
         WHERE ($2::uuid IS NULL OR user_id > $2::uuid)
         ORDER BY user_id LIMIT $3`,
        [auth.projectId, parsed.data.cursor ?? null, parsed.data.limit + 1],
      );
      const items = result.rows.slice(0, parsed.data.limit).map(view);
      return sharingMemberPageSchema.parse({
        items,
        nextCursor: result.rows.length > parsed.data.limit ? items.at(-1)?.userId : null,
      });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.patch(`${path}/:userId`, ownerOnly, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const userId = (request.params as { userId?: unknown }).userId;
      if (!isUUID(userId)) throw new AuthError(400, "VALIDATION_ERROR");
      const parsed = sharingMemberRolePatchSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      if (userId === auth.userId) throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
      const member = await db.transaction(async (tx) => {
        await lockOwner(tx, auth, request.headers["x-csrf-token"]);
        await lockActiveMember(tx, auth.projectId, userId);
        const updated = await tx.query<MemberRow>(
          `UPDATE project_members pm
           SET role = $3, source_share_link_id = NULL
           FROM users u
           WHERE pm.project_id = $1 AND pm.user_id = $2 AND u.id = pm.user_id
           RETURNING pm.user_id, u.display_name, pm.role, pm.revoked_at`,
          [auth.projectId, userId, parsed.data.role],
        );
        await tx.query(
          `INSERT INTO audit_events (actor_id, project_id, action, target_type, target_id, request_id)
           VALUES ($1, $2, 'project.member.role_changed', 'user', $3, $4)`,
          [auth.userId, auth.projectId, userId, request.id],
        );
        return view(updated.rows[0]!);
      });
      await publish
        .publish({ type: "role_changed", userId, projectId: auth.projectId, newRole: member.role })
        .catch((error: unknown) => {
          request.log.warn(
            { requestId: request.id, reason: error instanceof Error ? error.message : "unknown" },
            "Collab role invalidation not delivered",
          );
        });
      return reply.send(member);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.delete(`${path}/:userId`, ownerOnly, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const userId = (request.params as { userId?: unknown }).userId;
      if (!isUUID(userId)) throw new AuthError(400, "VALIDATION_ERROR");
      if (userId === auth.userId) throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
      await db.transaction(async (tx) => {
        await lockOwner(tx, auth, request.headers["x-csrf-token"]);
        await lockActiveMember(tx, auth.projectId, userId);
        await tx.query(
          "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
          [auth.projectId, userId],
        );
        await tx.query(
          `INSERT INTO audit_events (actor_id, project_id, action, target_type, target_id, request_id)
           VALUES ($1, $2, 'project.member.removed', 'user', $3, $4)`,
          [auth.userId, auth.projectId, userId, request.id],
        );
      });
      await publish
        .publish({ type: "member_removed", userId, projectId: auth.projectId })
        .catch((error: unknown) => {
          request.log.warn(
            { requestId: request.id, reason: error instanceof Error ? error.message : "unknown" },
            "Collab removal invalidation not delivered",
          );
        });
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
