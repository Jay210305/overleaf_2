import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  chatListQuerySchema,
  chatMessagePageSchema,
  chatMessageViewSchema,
  createChatMessageSchema,
} from "@latex-collab/contracts";
import type { DatabaseClient, TransactionContext } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";
import type { ProjectAuthorization } from "../../plugins/require-session.js";
import { assertChatBody, checkChatRateLimit } from "./safety.js";
import { assertWriterRole } from "../comments/safety.js";

interface ChatRow {
  id: string;
  project_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: Date;
}

function view(row: ChatRow) {
  return chatMessageViewSchema.parse({
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  });
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

async function currentWriter(tx: TransactionContext, auth: ProjectAuthorization, csrf: unknown) {
  const session = await tx.query<{
    csrf_hash: string | null;
    revoked_at: Date | null;
    expires_at: Date;
    created_at: Date;
    disabled_at: Date | null;
    email_verified_at: Date | null;
  }>(
    `SELECT s.csrf_hash, s.revoked_at, s.expires_at, s.created_at, u.disabled_at, u.email_verified_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2 FOR UPDATE OF s, u`,
    [auth.sessionId, auth.userId],
  );
  const actor = session.rows[0];
  if (
    !actor ||
    actor.revoked_at ||
    actor.expires_at.getTime() <= Date.now() ||
    actor.created_at.getTime() + 30 * 24 * 60 * 60 * 1000 <= Date.now()
  )
    throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  if (actor.disabled_at || !actor.email_verified_at) throw new AuthError(403, "ACCOUNT_DISABLED");
  requireSessionCsrf(csrf, actor.csrf_hash);
  const project = await tx.query<{ owner_id: string; status: string; role: string | null }>(
    `SELECT p.owner_id, p.status, pm.role FROM projects p
     LEFT JOIN active_project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.id = $1 FOR UPDATE OF p`,
    [auth.projectId, auth.userId],
  );
  const row = project.rows[0];
  if (!row || row.status !== "active" || (row.owner_id !== auth.userId && !row.role))
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  assertWriterRole(row.role, row.owner_id === auth.userId);
}

export function registerChatRoutes(app: FastifyInstance, db: DatabaseClient): void {
  const path = "/api/v1/projects/:projectId/chat/messages";

  app.get(path, { config: { projectAction: "COMMENT" } }, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const parsed = chatListQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      let cursor: { created_at: string; id: string } | undefined;
      if (parsed.data.cursor) {
        const found = await db.query<{ created_at: string; id: string }>(
          `SELECT created_at::text AS created_at, id FROM chat_messages
           WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [auth.projectId, parsed.data.cursor],
        );
        cursor = found.rows[0];
        if (!cursor) throw new AuthError(400, "VALIDATION_ERROR");
      }
      const rows = await db.query<ChatRow>(
        `SELECT m.id, m.project_id, m.author_id, u.display_name AS author_name,
                m.body, m.created_at FROM chat_messages m
         JOIN users u ON u.id = m.author_id
         WHERE m.project_id = $1 AND m.deleted_at IS NULL
           AND ($2::timestamptz IS NULL OR (m.created_at, m.id) < ($2::timestamptz, $3::uuid))
         ORDER BY m.created_at DESC, m.id DESC LIMIT $4`,
        [auth.projectId, cursor?.created_at ?? null, cursor?.id ?? null, parsed.data.limit + 1],
      );
      const items = rows.rows.slice(0, parsed.data.limit);
      return chatMessagePageSchema.parse({
        items: items.map(view),
        nextCursor: rows.rows.length > parsed.data.limit ? items.at(-1)?.id : null,
      });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.post(path, { config: { projectAction: "COMMENT" } }, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const parsed = createChatMessageSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const created = await db.transaction(async (tx) => {
        await currentWriter(tx, auth, request.headers["x-csrf-token"]);
        assertChatBody(parsed.data.body);
        await checkChatRateLimit(tx, { projectId: auth.projectId, userId: auth.userId });
        const inserted = await tx.query<ChatRow>(
          `WITH created AS (
             INSERT INTO chat_messages (project_id, author_id, body)
             VALUES ($1, $2, $3) RETURNING id, project_id, author_id, body, created_at
           ) SELECT created.*, u.display_name AS author_name
             FROM created JOIN users u ON u.id = created.author_id`,
          [auth.projectId, auth.userId, parsed.data.body.trim()],
        );
        return inserted.rows[0]!;
      });
      return reply.code(201).send(view(created));
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
