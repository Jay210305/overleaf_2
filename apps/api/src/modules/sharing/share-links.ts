import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createShareLinkSchema,
  createdShareLinkSchema,
  listShareLinksSchema,
  redeemShareLinkSchema,
  shareLinkPageSchema,
  shareLinkRedemptionViewSchema,
  shareLinkViewSchema,
  type ShareLinkView,
  z,
} from "@latex-collab/contracts";
import { isUUID, type DatabaseClient, type TransactionContext } from "@latex-collab/db";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";
import { requireSession, type SessionIdentity } from "../../plugins/require-session.js";
import { AuthError, tokenHash } from "../auth/errors.js";
import {
  noopCollabInvalidationPublisher,
  type CollabInvalidationPublisher,
} from "../collab/invalidation.js";

const maximumLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const sessionAbsoluteMs = 30 * 24 * 60 * 60 * 1000;

interface ShareLinkRow {
  id: string;
  project_id: string;
  role: "EDITOR" | "REVIEWER" | "VIEWER";
  token_hash: string;
  expires_at: Date;
  max_uses: string | null;
  use_count: string;
  revoked_at: Date | null;
  created_at: Date;
}

const cursorSchema = z.strictObject({
  projectId: z.uuid(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

function view(row: ShareLinkRow): ShareLinkView {
  return shareLinkViewSchema.parse({
    id: row.id,
    projectId: row.project_id,
    role: row.role,
    expiresAt: row.expires_at.toISOString(),
    maxUses: row.max_uses === null ? null : Number(row.max_uses),
    useCount: Number(row.use_count),
    revokedAt: row.revoked_at?.toISOString() ?? null,
  });
}

function decodeCursor(raw: string, projectId: string) {
  try {
    const decoded = cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    if (decoded.projectId !== projectId) throw new Error("Wrong project");
    return decoded;
  } catch {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
}

async function lockProject(tx: TransactionContext, projectId: string) {
  const result = await tx.query<{ owner_id: string; status: string }>(
    "SELECT owner_id, status FROM projects WHERE id = $1 FOR UPDATE",
    [projectId],
  );
  const project = result.rows[0];
  if (!project || project.status !== "active") throw new AuthError(404, "RESOURCE_NOT_FOUND");
  return project;
}

async function lockActor(tx: TransactionContext, identity: SessionIdentity, csrf: unknown) {
  const result = await tx.query<{
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
}

async function findLinkProject(db: DatabaseClient, token: string): Promise<string> {
  const result = await db.query<{ project_id: string }>(
    "SELECT project_id FROM share_links WHERE token_hash = $1",
    [tokenHash(token)],
  );
  if (!result.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
  return result.rows[0].project_id;
}

async function createShareLink(
  tx: TransactionContext,
  projectId: string,
  role: "EDITOR" | "REVIEWER" | "VIEWER",
  token: string,
  expiresAt: Date,
  maxUses: number | null,
) {
  const result = await tx.query<ShareLinkRow>(
    `INSERT INTO share_links (project_id, token_hash, role, expires_at, max_uses)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, project_id, role, token_hash, expires_at, max_uses::text,
               use_count::text, revoked_at, created_at`,
    [projectId, tokenHash(token), role, expiresAt, maxUses ?? null],
  );
  return result.rows[0]!;
}

export function registerShareLinkRoutes(
  app: FastifyInstance,
  options: {
    db: DatabaseClient;
    origin?: string | undefined;
    secureCookies: boolean;
    collabInvalidation?: CollabInvalidationPublisher | undefined;
  },
): void {
  const { db } = options;
  const publish = options.collabInvalidation ?? noopCollabInvalidationPublisher();
  const ownedPath = "/api/v1/projects/:projectId/share-links";

  app.post(ownedPath, { config: { projectAction: "MANAGE_MEMBERS" } }, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const parsed = createShareLinkSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const expiresAt = new Date(parsed.data.expiresAt);
      const now = Date.now();
      if (expiresAt.getTime() <= now || expiresAt.getTime() > now + maximumLifetimeMs)
        throw new AuthError(400, "VALIDATION_ERROR");
      const token = randomBytes(32).toString("base64url");
      const row = await db.transaction(async (tx) => {
        const project = await lockProject(tx, auth.projectId);
        await lockActor(tx, auth, request.headers["x-csrf-token"]);
        if (project.owner_id !== auth.userId) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        const link = await createShareLink(
          tx,
          auth.projectId,
          parsed.data.role,
          token,
          expiresAt,
          parsed.data.maxUses ?? null,
        );
        return link;
      });
      return reply.code(201).send(createdShareLinkSchema.parse({ link: view(row), token }));
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.get(ownedPath, { config: { projectAction: "MANAGE_MEMBERS" } }, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const parsed = listShareLinksSchema.safeParse(request.query);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor, auth.projectId) : null;
      const result = await db.query<ShareLinkRow & { cursor_created_at: string }>(
        `SELECT id, project_id, role, token_hash, expires_at, max_uses::text, use_count::text,
                revoked_at, created_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
         FROM share_links WHERE project_id = $1
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
      return shareLinkPageSchema.parse({ items: rows.map(view), nextCursor });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.delete(
    `${ownedPath}/:linkId`,
    { config: { projectAction: "MANAGE_MEMBERS" } },
    async (request, reply) => {
      try {
        const auth = request.projectAuthorization!;
        const linkId = (request.params as { linkId?: unknown }).linkId;
        if (!isUUID(linkId)) throw new AuthError(400, "VALIDATION_ERROR");
        await db.transaction(async (tx) => {
          const project = await lockProject(tx, auth.projectId);
          await lockActor(tx, auth, request.headers["x-csrf-token"]);
          if (project.owner_id !== auth.userId) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          const updated = await tx.query<{ id: string }>(
            `UPDATE share_links SET revoked_at = NOW()
             WHERE id = $1 AND project_id = $2 AND revoked_at IS NULL RETURNING id`,
            [linkId, auth.projectId],
          );
          if (!updated.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          await tx.query(
            `UPDATE project_members SET revoked_at = NOW()
             WHERE project_id = $1 AND source_share_link_id = $2 AND revoked_at IS NULL`,
            [auth.projectId, linkId],
          );
        });
        const affected = await db.query<{ user_id: string }>(
          `SELECT user_id FROM project_members WHERE project_id = $1 AND source_share_link_id = $2`,
          [auth.projectId, linkId],
        );
        for (const row of affected.rows) {
          await publish
            .publish({ type: "member_removed", userId: row.user_id, projectId: auth.projectId })
            .catch((error: unknown) => {
              request.log.warn(
                {
                  requestId: request.id,
                  reason: error instanceof Error ? error.message : "unknown",
                },
                "Collab link-revocation invalidation not delivered",
              );
            });
        }
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof AuthError) return reject(reply, request, error);
        throw error;
      }
    },
  );

  app.post("/api/v1/share-links/redeem", async (request, reply) => {
    try {
      const identity = await requireSession(
        db,
        request,
        options.origin,
        options.secureCookies,
        true,
      );
      const parsed = redeemShareLinkSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const projectId = await findLinkProject(db, parsed.data.token);
      const result = await db.transaction(async (tx) => {
        const project = await lockProject(tx, projectId);
        await lockActor(tx, identity, request.headers["x-csrf-token"]);
        if (project.owner_id === identity.userId) throw new AuthError(409, "SHARE_LINK_CONFLICT");
        const found = await tx.query<ShareLinkRow>(
          `SELECT id, project_id, role, token_hash, expires_at, max_uses::text,
                  use_count::text, revoked_at, created_at
           FROM share_links WHERE project_id = $1 AND token_hash = $2 FOR UPDATE`,
          [projectId, tokenHash(parsed.data.token)],
        );
        const link = found.rows[0];
        if (!link || link.revoked_at) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        if (link.expires_at.getTime() <= Date.now()) throw new AuthError(410, "SHARE_LINK_EXPIRED");
        if (link.max_uses !== null && Number(link.use_count) >= Number(link.max_uses))
          throw new AuthError(410, "SHARE_LINK_EXHAUSTED");
        const member = await tx.query<{ role: string }>(
          `INSERT INTO project_members (project_id, user_id, role, source_share_link_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (project_id, user_id) DO UPDATE
             SET role = EXCLUDED.role, source_share_link_id = EXCLUDED.source_share_link_id,
                 revoked_at = NULL, joined_at = NOW()
           WHERE (project_members.revoked_at IS NULL OR project_members.revoked_at < $5)
             AND (
               project_members.revoked_at IS NOT NULL
               OR (project_members.source_share_link_id IS NOT NULL AND EXISTS (
                 SELECT 1 FROM share_links prior WHERE prior.id = project_members.source_share_link_id
                   AND (prior.revoked_at < $5 OR prior.expires_at < $5)
               ))
             )
           RETURNING role`,
          [projectId, identity.userId, link.role, link.id, link.created_at],
        );
        if (!member.rows[0]) throw new AuthError(409, "SHARE_LINK_CONFLICT");
        await tx.query("UPDATE share_links SET use_count = use_count + 1 WHERE id = $1", [link.id]);
        return shareLinkRedemptionViewSchema.parse({ projectId, role: link.role });
      });
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
