import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import type { FastifyInstance } from "fastify";
import { allowsProjectAction } from "@latex-collab/auth";
import type { Role } from "@latex-collab/contracts";
import { isUUID, type DatabaseClient } from "@latex-collab/db";
import { isOriginAllowed } from "@latex-collab/config/server";
import { tokenHash } from "../auth/errors.js";
import { readSessionCookie } from "../auth/session.js";

interface Position {
  id: string;
  created_at: string;
}

async function canRead(db: DatabaseClient, sessionId: string, projectId: string) {
  const result = await db.query<{
    owner_id: string;
    user_id: string;
    role: Role | null;
    status: string;
    expires_at: Date;
    created_at: Date;
    revoked_at: Date | null;
    disabled_at: Date | null;
    email_verified_at: Date | null;
  }>(
    `SELECT p.owner_id, s.user_id, pm.role, p.status, s.expires_at,
            s.created_at, s.revoked_at, u.disabled_at, u.email_verified_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     JOIN projects p ON p.id = $2
     LEFT JOIN active_project_members pm ON pm.project_id = p.id AND pm.user_id = s.user_id
     WHERE s.id = $1`,
    [sessionId, projectId],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.status !== "active" ||
    row.revoked_at ||
    row.disabled_at ||
    !row.email_verified_at ||
    row.expires_at.getTime() <= Date.now() ||
    row.created_at.getTime() + 30 * 24 * 60 * 60 * 1000 <= Date.now()
  )
    return false;
  const role = row.owner_id === row.user_id ? "OWNER" : row.role;
  return role !== null && allowsProjectAction(role, "COMMENT");
}

export function registerChatEvents(
  app: FastifyInstance,
  db: DatabaseClient,
  origin: string | readonly string[] | undefined,
  secureCookies: boolean,
) {
  const wss = new WebSocketServer({ noServer: true });
  const upgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const match = /^\/api\/v1\/projects\/([^/]+)\/chat\/events$/.exec(url.pathname);
    if (!match) return;
    const projectId = match[1];
    if (
      !origin ||
      !isOriginAllowed(request.headers.origin, origin) ||
      url.search ||
      !isUUID(projectId)
    ) {
      socket.destroy();
      return;
    }
    void (async () => {
      const token = readSessionCookie(request.headers.cookie, secureCookies);
      const found = await db.query<{ id: string }>(
        "SELECT id FROM sessions WHERE token_hash = $1",
        [tokenHash(token)],
      );
      const sessionId = found.rows[0]?.id;
      if (!sessionId || !(await canRead(db, sessionId, projectId))) {
        socket.destroy();
        return;
      }
      const last = await db.query<Position>(
        `SELECT id, created_at::text AS created_at FROM chat_messages WHERE project_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [projectId],
      );
      wss.handleUpgrade(request, socket, head, (ws) => {
        let position = last.rows[0];
        let polling = false;
        const poll = async () => {
          if (polling || ws.readyState !== WebSocket.OPEN) return;
          polling = true;
          try {
            if (!(await canRead(db, sessionId, projectId))) {
              ws.close(4403, "PROJECT_PERMISSION_DENIED");
              return;
            }
            const next = await db.query<Position>(
              `SELECT id, created_at::text AS created_at FROM chat_messages
               WHERE project_id = $1 AND deleted_at IS NULL
                 AND ($2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3::uuid))
               ORDER BY created_at, id LIMIT 100`,
              [projectId, position?.created_at ?? null, position?.id ?? null],
            );
            for (const row of next.rows) {
              if (ws.readyState !== WebSocket.OPEN) break;
              ws.send(
                JSON.stringify({
                  eventId: randomUUID(),
                  version: 1,
                  projectId,
                  occurredAt: new Date().toISOString(),
                  type: "chat.created",
                  payload: { messageId: row.id },
                }),
              );
              position = row;
            }
          } catch {
            ws.close(1011, "SERVICE_UNAVAILABLE");
          } finally {
            polling = false;
          }
        };
        const timer = setInterval(() => void poll(), 1000);
        ws.on("message", () => ws.close(1008, "READ_ONLY"));
        ws.on("close", () => clearInterval(timer));
        ws.send(JSON.stringify({ type: "chat.ready", projectId }));
      });
    })().catch(() => socket.destroy());
  };
  app.server.on("upgrade", upgrade);
  app.addHook("onClose", async () => {
    app.server.off("upgrade", upgrade);
    for (const ws of wss.clients) ws.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
}
