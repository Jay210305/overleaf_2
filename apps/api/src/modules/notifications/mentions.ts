import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  notificationListQuerySchema,
  notificationPageSchema,
  notificationViewSchema,
} from "@latex-collab/contracts";
import { isUUID, type DatabaseClient, type TransactionContext } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { requireSession } from "../../plugins/require-session.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";

type Kind = "mention" | "reply";
interface NotificationRow {
  id: string;
  type: Kind;
  payload_json: unknown;
  project_title: string;
  read_at: Date | null;
  created_at: Date;
}

export async function createMentionNotifications(
  tx: TransactionContext,
  projectId: string,
  sourceId: string,
  actorId: string,
  recipients: string[],
  kind: Kind = "mention",
): Promise<void> {
  if (recipients.length === 0) return;
  await tx.query(
    `INSERT INTO notifications (user_id, type, payload_json)
     SELECT u.id, $4, jsonb_build_object('projectId', $1::uuid, 'sourceId', $2::uuid)
     FROM users u JOIN projects p ON p.id = $1
     LEFT JOIN active_project_members pm ON pm.project_id = p.id AND pm.user_id = u.id
     LEFT JOIN user_preferences pref ON pref.user_id = u.id
     WHERE u.id = ANY($3::uuid[]) AND u.id <> $5 AND u.disabled_at IS NULL
       AND u.email_verified_at IS NOT NULL AND p.status = 'active'
       AND (p.owner_id = u.id OR pm.user_id IS NOT NULL)
       AND COALESCE((pref.notification_settings_json->>'inApp')::boolean, true)
       AND COALESCE((pref.notification_settings_json->>$6)::boolean, true)
     ON CONFLICT DO NOTHING`,
    [projectId, sourceId, recipients, kind, actorId, kind === "mention" ? "mentions" : "replies"],
  );
}

function view(row: NotificationRow) {
  const payload = row.payload_json as { projectId: unknown; sourceId: unknown };
  return notificationViewSchema.parse({
    id: row.id,
    type: row.type,
    projectId: payload.projectId,
    sourceId: payload.sourceId,
    projectTitle: row.project_title,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  });
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

const visible = `FROM notifications n
  JOIN projects p ON p.id::text = n.payload_json->>'projectId' AND p.status = 'active'
  LEFT JOIN active_project_members pm ON pm.project_id = p.id AND pm.user_id = n.user_id
  WHERE n.user_id = $1 AND n.type IN ('mention', 'reply')
    AND (p.owner_id = n.user_id OR pm.user_id IS NOT NULL)`;

export function registerNotificationRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  origin: string | undefined,
  secureCookies: boolean,
): void {
  app.get("/api/v1/me/notifications", async (request, reply) => {
    try {
      const identity = await requireSession(db, request, origin, secureCookies);
      const parsed = notificationListQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      let cursor: { id: string; created_at: string } | undefined;
      if (parsed.data.cursor) {
        const found = await db.query<{ id: string; created_at: string }>(
          `SELECT n.id, n.created_at::text AS created_at ${visible} AND n.id = $2`,
          [identity.userId, parsed.data.cursor],
        );
        cursor = found.rows[0];
        if (!cursor) throw new AuthError(400, "VALIDATION_ERROR");
      }
      const found = await db.query<NotificationRow>(
        `SELECT n.id, n.type, n.payload_json, n.read_at, n.created_at,
                p.title AS project_title ${visible}
         AND ($2::timestamptz IS NULL OR (n.created_at, n.id) < ($2::timestamptz, $3::uuid))
         ORDER BY n.created_at DESC, n.id DESC LIMIT $4`,
        [identity.userId, cursor?.created_at ?? null, cursor?.id ?? null, parsed.data.limit + 1],
      );
      const items = found.rows.slice(0, parsed.data.limit);
      return notificationPageSchema.parse({
        items: items.map(view),
        nextCursor: found.rows.length > parsed.data.limit ? items.at(-1)?.id : null,
      });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.patch("/api/v1/me/notifications/:notificationId/read", async (request, reply) => {
    try {
      const identity = await requireSession(db, request, origin, secureCookies, true);
      const notificationId = (request.params as { notificationId?: unknown }).notificationId;
      if (
        !isUUID(notificationId) ||
        !request.body ||
        typeof request.body !== "object" ||
        Array.isArray(request.body) ||
        Object.keys(request.body).length !== 0
      )
        throw new AuthError(400, "VALIDATION_ERROR");
      const result = await db.transaction(async (tx) => {
        const found = await tx.query<{
          csrf_hash: string | null;
          revoked_at: Date | null;
          expires_at: Date;
          created_at: Date;
          disabled_at: Date | null;
          email_verified_at: Date | null;
        }>(
          `SELECT s.csrf_hash, s.revoked_at, s.expires_at, s.created_at, u.disabled_at, u.email_verified_at
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id = $1 AND s.user_id = $2 FOR UPDATE OF s`,
          [identity.sessionId, identity.userId],
        );
        const session = found.rows[0];
        if (
          !session ||
          session.revoked_at ||
          session.expires_at.getTime() <= Date.now() ||
          session.created_at.getTime() + 30 * 24 * 60 * 60 * 1000 <= Date.now()
        )
          throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        if (session.disabled_at || !session.email_verified_at)
          throw new AuthError(403, "ACCOUNT_DISABLED");
        requireSessionCsrf(request.headers["x-csrf-token"], session.csrf_hash);
        const updated = await tx.query<NotificationRow>(
          `UPDATE notifications n SET read_at = COALESCE(n.read_at, NOW())
           FROM projects p
           WHERE n.id = $2 AND n.user_id = $1 AND n.type IN ('mention', 'reply')
             AND p.id::text = n.payload_json->>'projectId' AND p.status = 'active'
             AND (p.owner_id = $1 OR EXISTS (
               SELECT 1 FROM active_project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1
             ))
           RETURNING n.id, n.type, n.payload_json, n.read_at, n.created_at, p.title AS project_title`,
          [identity.userId, notificationId],
        );
        if (!updated.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        return updated.rows[0];
      });
      return reply.send(view(result));
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
