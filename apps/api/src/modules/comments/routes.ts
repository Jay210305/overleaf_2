import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as Y from "yjs";
import {
  commentListQuerySchema,
  commentPageSchema,
  commentPatchSchema,
  commentViewSchema,
  createCommentSchema,
  replyRequestSchema,
  replyViewSchema,
} from "@latex-collab/contracts";
import { isUUID, type DatabaseClient, type TransactionContext } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";
import type { ProjectAuthorization } from "../../plugins/require-session.js";
import { DefaultTextDocumentService } from "../text/text-document-service.js";
import { resolveCommentAnchor, type ResolvedCommentAnchor } from "./anchors.js";

type CommentRow = {
  id: string;
  project_id: string;
  file_id: string;
  created_by: string;
  anchor_start_json: unknown;
  anchor_end_json: unknown;
  selected_text: string;
  body: string;
  mentions: string[];
  status: "open" | "resolved";
  created_at: Date;
};
type ReplyRow = {
  id: string;
  comment_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: Date;
};

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

async function currentWriter(tx: TransactionContext, auth: ProjectAuthorization, csrf: unknown) {
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
  const session = actor.rows[0];
  if (
    !session ||
    session.revoked_at ||
    session.expires_at.getTime() <= Date.now() ||
    session.created_at.getTime() + 30 * 24 * 60 * 60 * 1000 <= Date.now()
  )
    throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  if (session.disabled_at || !session.email_verified_at)
    throw new AuthError(403, "ACCOUNT_DISABLED");
  requireSessionCsrf(csrf, session.csrf_hash);

  const project = await tx.query<{ owner_id: string; status: string; role: string | null }>(
    `SELECT p.owner_id, p.status, pm.role FROM projects p
     LEFT JOIN active_project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.id = $1 FOR UPDATE OF p`,
    [auth.projectId, auth.userId],
  );
  const row = project.rows[0];
  if (!row || row.status !== "active" || (row.owner_id !== auth.userId && !row.role))
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  if (row.owner_id !== auth.userId && row.role === "VIEWER")
    throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
  return row.owner_id === auth.userId;
}

async function checkMentions(tx: TransactionContext, projectId: string, mentions: string[]) {
  if (new Set(mentions).size !== mentions.length) throw new AuthError(400, "VALIDATION_ERROR");
  if (mentions.length === 0) return;
  const found = await tx.query<{ id: string }>(
    `SELECT owner_id AS id FROM projects WHERE id = $1
     UNION SELECT user_id AS id FROM active_project_members WHERE project_id = $1`,
    [projectId],
  );
  const allowed = new Set(found.rows.map((row) => row.id));
  if (mentions.some((id) => !allowed.has(id))) throw new AuthError(400, "VALIDATION_ERROR");
}

export function registerCommentRoutes(app: FastifyInstance, db: DatabaseClient): void {
  const path = "/api/v1/projects/:projectId/comments";
  const textService = new DefaultTextDocumentService(db);

  async function view(row: CommentRow, actorId: string) {
    let location: ResolvedCommentAnchor = {
      detached: true,
      detachedReason: "range_changed",
      start: null,
      end: null,
    };
    try {
      const state = await textService.load(row.project_id, row.file_id, actorId);
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, Buffer.from(state.updateBase64, "base64"));
        location = resolveCommentAnchor(
          doc,
          row.anchor_start_json,
          row.anchor_end_json,
          row.selected_text,
        );
      } finally {
        doc.destroy();
      }
    } catch (error) {
      if (!(error instanceof AuthError) || error.status !== 404) throw error;
    }
    const replies = await db.query<ReplyRow>(
      `SELECT id, comment_id, author_id, body, mentions, created_at FROM comment_replies
       WHERE comment_id = $1 AND deleted_at IS NULL ORDER BY created_at, id`,
      [row.id],
    );
    return commentViewSchema.parse({
      id: row.id,
      projectId: row.project_id,
      fileId: row.file_id,
      createdBy: row.created_by,
      body: row.body,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      anchorStart: row.anchor_start_json,
      anchorEnd: row.anchor_end_json,
      selectedText: row.selected_text,
      mentions: row.mentions,
      replies: replies.rows.map((reply) =>
        replyViewSchema.parse({
          id: reply.id,
          commentId: reply.comment_id,
          authorId: reply.author_id,
          body: reply.body,
          mentions: reply.mentions,
          createdAt: reply.created_at.toISOString(),
        }),
      ),
      ...location,
    });
  }

  async function one(projectId: string, commentId: string) {
    const found = await db.query<CommentRow>(
      `SELECT * FROM comments WHERE project_id = $1 AND id = $2`,
      [projectId, commentId],
    );
    if (!found.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
    return found.rows[0];
  }

  app.get(path, { config: { projectAction: "READ" } }, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const parsed = commentListQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const rows = await db.query<CommentRow>(
        `SELECT * FROM comments WHERE project_id = $1 AND ($2::uuid IS NULL OR id > $2::uuid)
         ORDER BY id LIMIT $3`,
        [auth.projectId, parsed.data.cursor ?? null, parsed.data.limit + 1],
      );
      const slice = rows.rows.slice(0, parsed.data.limit);
      return commentPageSchema.parse({
        items: await Promise.all(slice.map((row) => view(row, auth.userId))),
        nextCursor: rows.rows.length > parsed.data.limit ? slice.at(-1)?.id : null,
      });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.post(path, { config: { projectAction: "COMMENT" } }, async (request, reply) => {
    try {
      const auth = request.projectAuthorization!;
      const parsed = createCommentSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      const input = parsed.data;
      const state = await textService.load(auth.projectId, input.fileId, auth.userId);
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, Buffer.from(state.updateBase64, "base64"));
        if (
          resolveCommentAnchor(doc, input.anchorStart, input.anchorEnd, input.selectedText).detached
        )
          throw new AuthError(409, "REVISION_CONFLICT");
      } finally {
        doc.destroy();
      }
      const row = await db.transaction(async (tx) => {
        await currentWriter(tx, auth, request.headers["x-csrf-token"]);
        const file = await tx.query<{ id: string }>(
          `SELECT id FROM project_nodes WHERE id = $1 AND project_id = $2
           AND kind = 'FILE' AND content_kind = 'TEXT' AND deleted_at IS NULL`,
          [input.fileId, auth.projectId],
        );
        if (!file.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        await checkMentions(tx, auth.projectId, input.mentions);
        const created = await tx.query<CommentRow>(
          `INSERT INTO comments (project_id, file_id, created_by, anchor_start_json,
             anchor_end_json, selected_text, body, mentions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            auth.projectId,
            input.fileId,
            auth.userId,
            input.anchorStart,
            input.anchorEnd,
            input.selectedText,
            input.body,
            JSON.stringify(input.mentions),
          ],
        );
        return created.rows[0]!;
      });
      return reply.code(201).send(await view(row, auth.userId));
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.post(
    `${path}/:commentId/replies`,
    { config: { projectAction: "COMMENT" } },
    async (request, reply) => {
      try {
        const auth = request.projectAuthorization!;
        const commentId = (request.params as { commentId?: unknown }).commentId;
        if (!isUUID(commentId)) throw new AuthError(400, "VALIDATION_ERROR");
        const parsed = replyRequestSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
        const row = await db.transaction(async (tx) => {
          await currentWriter(tx, auth, request.headers["x-csrf-token"]);
          const comment = await tx.query<{ id: string }>(
            "SELECT id FROM comments WHERE project_id = $1 AND id = $2 FOR UPDATE",
            [auth.projectId, commentId],
          );
          if (!comment.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          await checkMentions(tx, auth.projectId, parsed.data.mentions);
          const inserted = await tx.query<ReplyRow>(
            `INSERT INTO comment_replies (comment_id, author_id, body, mentions)
           VALUES ($1, $2, $3, $4) RETURNING *`,
            [commentId, auth.userId, parsed.data.body, JSON.stringify(parsed.data.mentions)],
          );
          return inserted.rows[0]!;
        });
        return reply.code(201).send(
          replyViewSchema.parse({
            id: row.id,
            commentId: row.comment_id,
            authorId: row.author_id,
            body: row.body,
            mentions: row.mentions,
            createdAt: row.created_at.toISOString(),
          }),
        );
      } catch (error) {
        if (error instanceof AuthError) return reject(reply, request, error);
        throw error;
      }
    },
  );

  app.patch(
    `${path}/:commentId`,
    { config: { projectAction: "COMMENT" } },
    async (request, reply) => {
      try {
        const auth = request.projectAuthorization!;
        const commentId = (request.params as { commentId?: unknown }).commentId;
        if (!isUUID(commentId)) throw new AuthError(400, "VALIDATION_ERROR");
        const parsed = commentPatchSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
        await db.transaction(async (tx) => {
          await currentWriter(tx, auth, request.headers["x-csrf-token"]);
          const changed = await tx.query(
            `UPDATE comments SET status = $3 WHERE project_id = $1 AND id = $2 RETURNING id`,
            [auth.projectId, commentId, parsed.data.status],
          );
          if (!changed.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        });
        return reply.send(await view(await one(auth.projectId, commentId), auth.userId));
      } catch (error) {
        if (error instanceof AuthError) return reject(reply, request, error);
        throw error;
      }
    },
  );

  app.delete(
    `${path}/:commentId`,
    { config: { projectAction: "COMMENT" } },
    async (request, reply) => {
      try {
        const auth = request.projectAuthorization!;
        const commentId = (request.params as { commentId?: unknown }).commentId;
        if (!isUUID(commentId)) throw new AuthError(400, "VALIDATION_ERROR");
        await db.transaction(async (tx) => {
          const owner = await currentWriter(tx, auth, request.headers["x-csrf-token"]);
          const comment = await tx.query<{ created_by: string }>(
            "SELECT created_by FROM comments WHERE project_id = $1 AND id = $2 FOR UPDATE",
            [auth.projectId, commentId],
          );
          if (!comment.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          if (!owner && comment.rows[0].created_by !== auth.userId)
            throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
          await tx.query("DELETE FROM comments WHERE project_id = $1 AND id = $2", [
            auth.projectId,
            commentId,
          ]);
        });
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof AuthError) return reject(reply, request, error);
        throw error;
      }
    },
  );
}
