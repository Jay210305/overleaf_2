import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createProjectInvitationSchema,
  listProjectInvitationsSchema,
  projectInvitationPageSchema,
  projectInvitationViewSchema,
  redeemProjectInvitationSchema,
  type ProjectInvitationView,
  z,
} from "@latex-collab/contracts";
import { type DatabaseClient, type TransactionContext, isUUID } from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";
import { requireSession, type SessionIdentity } from "../../plugins/require-session.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { AuthError, tokenHash } from "../auth/errors.js";
import { normalizeEmail } from "../auth/register.js";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const sessionAbsoluteMs = 30 * 24 * 60 * 60 * 1000;

export type SendProjectInvitation = (email: string, token: string) => Promise<void>;

interface InvitationRow {
  id: string;
  project_id: string;
  email_normalized: string;
  role: "EDITOR" | "REVIEWER" | "VIEWER";
  expires_at: Date;
  created_at: Date;
  delivered_at: Date | null;
  accepted_at: Date | null;
  rejected_at: Date | null;
  revoked_at: Date | null;
}

const cursorSchema = z.strictObject({
  projectId: z.uuid(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

function decodeCursor(raw: string, projectId: string) {
  try {
    const decoded = cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    if (decoded.projectId !== projectId) throw new Error("Wrong project");
    return decoded;
  } catch {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
}

function view(row: InvitationRow): ProjectInvitationView {
  const status = row.revoked_at
    ? "revoked"
    : row.rejected_at
      ? "rejected"
      : row.accepted_at
        ? "accepted"
        : row.expires_at.getTime() <= Date.now()
          ? "expired"
          : "pending";
  return projectInvitationViewSchema.parse({
    id: row.id,
    projectId: row.project_id,
    email: row.email_normalized,
    role: row.role,
    status,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  });
}

async function lockProject(tx: TransactionContext, projectId: string) {
  const result = await tx.query<{ owner_id: string; status: string }>(
    "SELECT owner_id, status FROM projects WHERE id = $1 FOR UPDATE",
    [projectId],
  );
  if (!result.rows[0] || result.rows[0].status !== "active")
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  return result.rows[0];
}

async function lockActor(
  tx: TransactionContext,
  identity: SessionIdentity,
  csrf: unknown,
): Promise<string> {
  const result = await tx.query<{
    email_normalized: string;
    csrf_hash: string | null;
    revoked_at: Date | null;
    expires_at: Date;
    created_at: Date;
    disabled_at: Date | null;
    email_verified_at: Date | null;
  }>(
    `SELECT u.email_normalized, u.disabled_at, u.email_verified_at,
            s.csrf_hash, s.revoked_at, s.expires_at, s.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2 FOR UPDATE OF s, u`,
    [identity.sessionId, identity.userId],
  );
  const actor = result.rows[0];
  if (
    !actor ||
    actor.revoked_at ||
    actor.expires_at.getTime() <= Date.now() ||
    actor.created_at.getTime() + sessionAbsoluteMs <= Date.now()
  )
    throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  if (actor.disabled_at || !actor.email_verified_at) throw new AuthError(403, "ACCOUNT_DISABLED");
  requireSessionCsrf(csrf, actor.csrf_hash);
  return actor.email_normalized;
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

function inviteToken(raw: unknown): string {
  const parsed = redeemProjectInvitationSchema.safeParse(raw);
  if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
  return parsed.data.token;
}

async function findInviteProject(db: DatabaseClient, token: string): Promise<string> {
  const result = await db.query<{ project_id: string }>(
    "SELECT project_id FROM project_invitations WHERE token_hash = $1",
    [tokenHash(token)],
  );
  if (!result.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
  return result.rows[0].project_id;
}

async function lockInvite(tx: TransactionContext, projectId: string, token: string) {
  const result = await tx.query<InvitationRow>(
    `SELECT id, project_id, email_normalized, role, expires_at, created_at,
            delivered_at, accepted_at, rejected_at, revoked_at
     FROM project_invitations WHERE project_id = $1 AND token_hash = $2 FOR UPDATE`,
    [projectId, tokenHash(token)],
  );
  const invite = result.rows[0];
  if (
    !invite ||
    !invite.delivered_at ||
    invite.accepted_at ||
    invite.rejected_at ||
    invite.revoked_at
  )
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  if (invite.expires_at.getTime() <= Date.now()) throw new AuthError(410, "INVITATION_EXPIRED");
  return invite;
}

export function registerProjectInvitationRoutes(
  app: FastifyInstance,
  options: {
    db: DatabaseClient;
    origin?: string | undefined;
    secureCookies: boolean;
    sendProjectInvitation?: SendProjectInvitation | undefined;
  },
): void {
  const { db } = options;
  const ownedPath = "/api/v1/projects/:projectId/invitations";

  app.post(ownedPath, { config: { projectAction: "MANAGE_MEMBERS" } }, async (request, reply) => {
    try {
      if (!options.sendProjectInvitation) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const auth = request.projectAuthorization!;
      const raw = request.body as { email?: unknown } | null;
      const email = typeof raw?.email === "string" ? normalizeEmail(raw.email) : undefined;
      const parsed = createProjectInvitationSchema.safeParse({ ...raw, email });
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const token = randomBytes(32).toString("base64url");
      const invitation = await db.transaction(async (tx) => {
        const project = await lockProject(tx, auth.projectId);
        const actorEmail = await lockActor(tx, auth, request.headers["x-csrf-token"]);
        if (project.owner_id !== auth.userId) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        const account = await tx.query<{
          id: string;
          member_user_id: string | null;
          revoked_at: Date | null;
          disabled_at: Date | null;
          email_verified_at: Date | null;
        }>(
          `SELECT u.id, u.disabled_at, u.email_verified_at,
                  pm.user_id AS member_user_id, pm.revoked_at FROM users u
           LEFT JOIN active_project_members pm ON pm.project_id = $1 AND pm.user_id = u.id
           WHERE u.email_normalized = $2`,
          [auth.projectId, parsed.data.email],
        );
        if (!account.rows[0] || account.rows[0].disabled_at || !account.rows[0].email_verified_at)
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        if (
          parsed.data.email === actorEmail ||
          (account.rows[0]?.member_user_id && account.rows[0].revoked_at === null)
        )
          throw new AuthError(409, "INVITATION_CONFLICT");
        await tx.query(
          `UPDATE project_invitations SET revoked_at = NOW()
           WHERE project_id = $1 AND email_normalized = $2
             AND accepted_at IS NULL AND rejected_at IS NULL AND revoked_at IS NULL`,
          [auth.projectId, parsed.data.email],
        );
        const inserted = await tx.query<InvitationRow>(
          `INSERT INTO project_invitations
             (project_id, email_normalized, role, token_hash, expires_at, invited_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, project_id, email_normalized, role, expires_at, created_at,
                     delivered_at, accepted_at, rejected_at, revoked_at`,
          [
            auth.projectId,
            parsed.data.email,
            parsed.data.role,
            tokenHash(token),
            new Date(Date.now() + invitationLifetimeMs),
            auth.userId,
          ],
        );
        return inserted.rows[0]!;
      });
      try {
        await options.sendProjectInvitation(parsed.data.email, token);
        const delivered = await db.query<{ id: string }>(
          `UPDATE project_invitations SET delivered_at = NOW()
           WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
          [invitation.id],
        );
        if (!delivered.rows[0]) throw new Error("Invitation revoked while sending");
      } catch {
        await db
          .query(
            "UPDATE project_invitations SET revoked_at = NOW() WHERE id = $1 AND accepted_at IS NULL",
            [invitation.id],
          )
          .catch(() => {});
        throw new AuthError(503, "SERVICE_UNAVAILABLE");
      }
      return reply.code(201).send(view(invitation));
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.get(ownedPath, { config: { projectAction: "MANAGE_MEMBERS" } }, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const parsed = listProjectInvitationsSchema.safeParse(request.query);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor, auth.projectId) : null;
      const result = await db.query<InvitationRow & { cursor_created_at: string }>(
        `SELECT id, project_id, email_normalized, role, expires_at, created_at,
                delivered_at, accepted_at, rejected_at, revoked_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
         FROM project_invitations WHERE project_id = $1
           AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
         ORDER BY created_at DESC, id DESC LIMIT $4`,
        [auth.projectId, cursor?.createdAt ?? null, cursor?.id ?? null, parsed.data.limit + 1],
      );
      const rows = result.rows.slice(0, parsed.data.limit);
      const last = rows.at(-1);
      const nextCursor =
        result.rows.length > parsed.data.limit && last
          ? Buffer.from(
              JSON.stringify({
                projectId: auth.projectId,
                createdAt: last.cursor_created_at,
                id: last.id,
              }),
            ).toString("base64url")
          : null;
      return projectInvitationPageSchema.parse({ items: rows.map(view), nextCursor });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.delete(
    `${ownedPath}/:invitationId`,
    { config: { projectAction: "MANAGE_MEMBERS" } },
    async (request, reply) => {
      try {
        const auth = request.projectAuthorization!;
        const invitationId = (request.params as { invitationId?: unknown }).invitationId;
        if (!isUUID(invitationId)) throw new AuthError(400, "VALIDATION_ERROR");
        await db.transaction(async (tx) => {
          const project = await lockProject(tx, auth.projectId);
          await lockActor(tx, auth, request.headers["x-csrf-token"]);
          if (project.owner_id !== auth.userId) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          const revoked = await tx.query<{ id: string }>(
            `UPDATE project_invitations SET revoked_at = NOW()
           WHERE id = $1 AND project_id = $2 AND accepted_at IS NULL
             AND rejected_at IS NULL AND revoked_at IS NULL RETURNING id`,
            [invitationId, auth.projectId],
          );
          if (!revoked.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        });
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof AuthError) return reject(reply, request, error);
        throw error;
      }
    },
  );

  async function redeem(request: FastifyRequest, reply: FastifyReply, accept: boolean) {
    try {
      const identity = await requireSession(
        db,
        request,
        options.origin,
        options.secureCookies,
        true,
      );
      const token = inviteToken(request.body);
      const projectId = await findInviteProject(db, token);
      const result = await db.transaction(async (tx) => {
        const project = await lockProject(tx, projectId);
        const actorEmail = await lockActor(tx, identity, request.headers["x-csrf-token"]);
        const invitation = await lockInvite(tx, projectId, token);
        if (invitation.email_normalized !== actorEmail || project.owner_id === identity.userId)
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        if (accept) {
          const member = await tx.query<{ role: string }>(
            `INSERT INTO project_members (project_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (project_id, user_id) DO UPDATE
               SET role = EXCLUDED.role, source_share_link_id = NULL,
                   revoked_at = NULL, joined_at = NOW()
             WHERE (project_members.revoked_at IS NOT NULL AND project_members.revoked_at < $4)
                OR (project_members.source_share_link_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM share_links previous
                  WHERE previous.id = project_members.source_share_link_id
                    AND (previous.revoked_at IS NOT NULL OR previous.expires_at <= NOW())
                ))
             RETURNING role`,
            [projectId, identity.userId, invitation.role, invitation.created_at],
          );
          if (!member.rows[0]) throw new AuthError(409, "INVITATION_CONFLICT");
        }
        await tx.query(
          `UPDATE project_invitations SET ${accept ? "accepted_at" : "rejected_at"} = NOW()
           WHERE id = $1`,
          [invitation.id],
        );
        return { projectId, role: invitation.role };
      });
      return accept ? reply.code(200).send(result) : reply.code(204).send();
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  }

  app.post("/api/v1/invitations/accept", async (request, reply) => redeem(request, reply, true));
  app.post("/api/v1/invitations/reject", async (request, reply) => redeem(request, reply, false));
}
