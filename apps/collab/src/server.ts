import http from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import type { DatabaseClient } from "@latex-collab/db";
import type { DurableAck } from "@latex-collab/contracts";
import type { TicketStore } from "./auth/ticket.js";
import {
  authenticateConnection,
  AuthenticationError,
  type AuthenticatedUserContext,
} from "./auth/authenticate.js";
import { UpdateLog } from "./persistence/update-log.js";
import { createDurableAck } from "./persistence/durable-ack.js";
import { SnapshotService } from "./persistence/snapshots.js";
import { TreeEventSynchronizer } from "./tree-events.js";
import { CollabRedisCoordinator } from "./redis.js";
import {
  LiveRevocationManager,
  type ActiveCollabSocket,
  type RevocationEvent,
} from "./auth/revocation.js";
import { CollabDurabilityMetrics } from "./metrics.js";

export interface CollabServerOptions {
  port?: number | undefined;
  server?: http.Server | undefined;
  allowedOrigin?: string | readonly string[] | undefined;
  db?: DatabaseClient | undefined;
  ticketStore: TicketStore;
  redisCoordinator?: CollabRedisCoordinator | undefined;
  heartbeatIntervalMs?: number | undefined;
}

export interface CollabClient {
  ws: WebSocket;
  auth?: AuthenticatedUserContext;
  isAlive: boolean;
}

export class CollabRoom {
  readonly clients = new Set<CollabClient>();
  readonly doc = new Y.Doc();
  lastPersistedSeq = 0;
  isLoaded = false;
  isDeleted = false;

  constructor(
    readonly roomId: string,
    readonly projectId: string,
    readonly fileId: string,
  ) {}

  broadcast(message: string, excludeWs?: WebSocket): void {
    for (const client of this.clients) {
      if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }
}

export class CollabServer {
  private wss?: WebSocketServer | undefined;
  private httpServer?: http.Server | undefined;
  private upgradeHandler?:
    ((request: http.IncomingMessage, socket: Socket, head: Buffer) => void) | undefined;
  private rooms = new Map<string, CollabRoom>();
  private updateLog?: UpdateLog | undefined;
  private snapshotService?: SnapshotService | undefined;
  private revocationManager: LiveRevocationManager;
  private treeSynchronizer: TreeEventSynchronizer;
  private metrics = new CollabDurabilityMetrics();
  private redisCoordinator?: CollabRedisCoordinator | undefined;
  private heartbeatInterval?: NodeJS.Timeout | undefined;

  constructor(private readonly options: CollabServerOptions) {
    if (options.db) {
      this.updateLog = new UpdateLog(options.db);
      this.snapshotService = new SnapshotService(options.db);
    }
    this.redisCoordinator = options.redisCoordinator;
    this.revocationManager = new LiveRevocationManager(options.ticketStore);

    this.treeSynchronizer = new TreeEventSynchronizer({
      notifyRoomClosed: (fileId, reason) => {
        this.closeRoomsForFile(fileId, reason);
      },
      markFileDeleted: (fileId) => {
        for (const room of this.rooms.values()) {
          if (room.fileId === fileId) {
            room.isDeleted = true;
          }
        }
      },
      isFileDeleted: (fileId) => this.treeSynchronizer.isFileDeleted(fileId),
    });

    if (this.redisCoordinator) {
      this.redisCoordinator.onInvalidation((data) => {
        if (typeof data === "object" && data !== null) {
          const event = data as { type?: string; projectId?: string; fileId?: string };
          if (event.type === "file_deleted" && event.projectId && event.fileId) {
            this.treeSynchronizer.handleEvent({
              eventId: crypto.randomUUID(),
              version: 1,
              projectId: event.projectId,
              occurredAt: new Date().toISOString(),
              type: "file.deleted",
              payload: { nodeId: event.fileId },
            });
            return;
          }
          void this.revocationManager.handleRevocation(data as RevocationEvent);
        }
      });
    }
  }

  async start(): Promise<void> {
    if (this.options.server) {
      this.httpServer = this.options.server;
    } else {
      const port = this.options.port ?? 0;
      this.httpServer = http.createServer();
      await new Promise<void>((resolve) => {
        this.httpServer!.listen(port, () => resolve());
      });
    }

    // The API shares this HTTP server with other WebSocket endpoints (project
    // chat lives on its own path). Use a path-aware handler so an unrelated
    // upgrade request is never claimed by two `handleUpgrade` calls.
    this.wss = new WebSocketServer({ noServer: true });
    this.upgradeHandler = (request, socket, head) => {
      const url = new URL(request.url ?? "", "http://localhost");
      if (url.pathname !== "/") return;
      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.wss!.emit("connection", ws, request);
      });
    };
    this.httpServer.on("upgrade", this.upgradeHandler);

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });

    const intervalMs = this.options.heartbeatIntervalMs ?? 30_000;
    if (intervalMs > 0) {
      this.heartbeatInterval = setInterval(() => {
        this.checkHeartbeats();
      }, intervalMs);
    }
  }

  checkHeartbeats(): void {
    for (const room of this.rooms.values()) {
      for (const client of Array.from(room.clients)) {
        if (!client.isAlive) {
          client.ws.terminate();
          room.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    for (const room of this.rooms.values()) {
      for (const client of room.clients) {
        client.ws.close(1001, "Server shutting down");
      }
    }
    this.rooms.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
    }
    if (this.upgradeHandler && this.httpServer) {
      this.httpServer.off("upgrade", this.upgradeHandler);
      this.upgradeHandler = undefined;
    }
    if (this.httpServer && !this.options.server) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
    }
  }

  getMetrics(): CollabDurabilityMetrics {
    return this.metrics;
  }

  getTreeSynchronizer(): TreeEventSynchronizer {
    return this.treeSynchronizer;
  }

  getRevocationManager(): LiveRevocationManager {
    return this.revocationManager;
  }

  getRoom(roomId: string): CollabRoom | undefined {
    return this.rooms.get(roomId);
  }

  private async hasCurrentAccess(
    auth: AuthenticatedUserContext,
    action: "read" | "write",
  ): Promise<boolean> {
    if (!this.options.db) return false;
    const result = await this.options.db.query<{
      expires_at: Date;
      session_created_at: Date;
      revoked_at: Date | null;
      disabled_at: Date | null;
      email_verified_at: Date | null;
      status: string;
      owner_id: string;
      role: string | null;
      member_revoked_at: Date | null;
      deleted_at: Date | null;
      content_kind: string;
    }>(
      `SELECT s.expires_at, s.created_at AS session_created_at, s.revoked_at,
              u.disabled_at, u.email_verified_at, p.status, p.owner_id,
              pm.role, pm.revoked_at AS member_revoked_at,
              n.deleted_at, n.content_kind
       FROM sessions s JOIN users u ON u.id = s.user_id
       JOIN projects p ON p.id = $3
       JOIN project_nodes n ON n.id = $4 AND n.project_id = p.id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = s.user_id
       WHERE s.id = $1 AND s.user_id = $2`,
      [auth.sessionId, auth.userId, auth.projectId, auth.fileId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.revoked_at ||
      row.disabled_at ||
      !row.email_verified_at ||
      row.expires_at.getTime() <= Date.now() ||
      row.session_created_at.getTime() + 30 * 24 * 60 * 60 * 1000 <= Date.now() ||
      row.status !== "active" ||
      row.deleted_at ||
      row.content_kind !== "TEXT"
    )
      return false;
    const role = row.owner_id === auth.userId ? "OWNER" : row.member_revoked_at ? null : row.role;
    return !!role && (action === "read" || (role !== "VIEWER" && role !== "REVIEWER"));
  }

  private async broadcastAuthorized(
    room: CollabRoom,
    message: string,
    excludeWs?: WebSocket,
  ): Promise<void> {
    for (const client of room.clients) {
      if (client.ws === excludeWs || client.ws.readyState !== WebSocket.OPEN) continue;
      let allowed = false;
      try {
        allowed = !!client.auth && (await this.hasCurrentAccess(client.auth, "read"));
      } catch {
        client.ws.close(1011, "AUTH_UNAVAILABLE");
        room.clients.delete(client);
        continue;
      }
      if (!allowed) {
        client.ws.close(4403, "ACCESS_REVOKED");
        room.clients.delete(client);
        continue;
      }
      client.ws.send(message);
    }
  }

  private async getOrCreateRoom(projectId: string, fileId: string): Promise<CollabRoom> {
    const roomId = `project:${projectId}:file:${fileId}`;
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new CollabRoom(roomId, projectId, fileId);
      this.rooms.set(roomId, room);
      this.metrics.setRoomCount(this.rooms.size);

      // Register with Redis Coordinator
      if (this.redisCoordinator) {
        this.redisCoordinator.registerRoom(
          roomId,
          (remoteUpdateBytes) => {
            // Apply update from another replica
            Y.applyUpdate(room!.doc, remoteUpdateBytes);
            // Broadcast to local room clients
            void this.broadcastAuthorized(
              room!,
              JSON.stringify({
                type: "sync.update",
                updateBase64: Buffer.from(remoteUpdateBytes).toString("base64"),
              }),
            );
          },
          (remoteAwareness, remoteUserId) => {
            void this.broadcastAuthorized(
              room!,
              JSON.stringify({
                type: "awareness",
                userId: remoteUserId,
                awareness: remoteAwareness,
              }),
            );
          },
        );
      }
    }

    // Load initial canonical doc from database if not loaded
    if (!room.isLoaded && this.updateLog) {
      const replayResult = await this.updateLog.replay(fileId);
      // Copy state from replayed doc
      const stateUpdate = Y.encodeStateAsUpdate(replayResult.doc);
      if (stateUpdate.length > 0) {
        Y.applyUpdate(room.doc, stateUpdate);
      }
      room.lastPersistedSeq = replayResult.lastPersistedSeq;
      room.isLoaded = true;
    }

    return room;
  }

  private closeRoomsForFile(fileId: string, reason: string): void {
    for (const [roomId, room] of Array.from(this.rooms.entries())) {
      if (room.fileId === fileId) {
        room.isDeleted = true;
        room.broadcast(JSON.stringify({ type: "room.closed", fileId, reason }));
        for (const client of room.clients) {
          client.ws.close(4404, reason);
        }
        room.clients.clear();
        this.rooms.delete(roomId);
        if (this.redisCoordinator) {
          this.redisCoordinator.unregisterRoom(roomId);
        }
      }
    }
    this.metrics.setRoomCount(this.rooms.size);
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    this.metrics.recordConnectionOpened();

    const client: CollabClient = {
      ws,
      isAlive: true,
    };

    ws.on("pong", () => {
      client.isAlive = true;
    });

    let cleanupRevocation: (() => void) | undefined;
    let joinedRoom: CollabRoom | null = null;
    let authCompleted = false;

    // Timeout unauthenticated sockets after 10 seconds
    const authTimeout = setTimeout(() => {
      if (!authCompleted && ws.readyState === WebSocket.OPEN) {
        ws.close(4401, "AUTHENTICATION_TIMEOUT");
      }
    }, 10_000);

    ws.on("message", async (rawMessage) => {
      try {
        const text = rawMessage.toString();
        const msg = JSON.parse(text);

        // 1. Initial Handshake / Authentication Message
        if (!authCompleted) {
          if (msg.type !== "auth" || !msg.ticket) {
            ws.send(JSON.stringify({ type: "error", code: "AUTHENTICATION_REQUIRED" }));
            ws.close(4401, "AUTHENTICATION_REQUIRED");
            return;
          }

          clearTimeout(authTimeout);

          const originHeader = req.headers.origin as string | undefined;

          try {
            const authContext = await authenticateConnection(
              {
                ticket: msg.ticket,
                origin: originHeader,
                allowedOrigin: this.options.allowedOrigin,
                expectedProjectId: msg.projectId,
                expectedFileId: msg.fileId,
              },
              this.options.ticketStore,
              this.options.db,
            );

            client.auth = authContext;
            authCompleted = true;

            if (!(await this.hasCurrentAccess(authContext, "read"))) {
              ws.send(JSON.stringify({ type: "error", code: "PERMISSION_DENIED" }));
              ws.close(4403, "ACCESS_REVOKED");
              return;
            }

            // Check if file was deleted
            if (this.treeSynchronizer.isFileDeleted(authContext.fileId)) {
              ws.send(JSON.stringify({ type: "error", code: "RESOURCE_NOT_FOUND" }));
              ws.close(4404, "RESOURCE_NOT_FOUND");
              return;
            }

            // Join or create room
            const room = await this.getOrCreateRoom(authContext.projectId, authContext.fileId);
            if (room.isDeleted) {
              ws.send(JSON.stringify({ type: "error", code: "RESOURCE_NOT_FOUND" }));
              ws.close(4404, "RESOURCE_NOT_FOUND");
              return;
            }

            room.clients.add(client);
            joinedRoom = room;

            // Register with live revocation manager
            const activeSocket: ActiveCollabSocket = {
              userId: authContext.userId,
              projectId: authContext.projectId,
              sessionId: authContext.sessionId,
              get action() {
                return client.auth?.action ?? "read";
              },
              set action(val: "read" | "write") {
                if (client.auth) {
                  client.auth.action = val;
                }
              },
              setRole(newRole: string) {
                if (client.auth) {
                  client.auth.role = newRole;
                }
              },
              close: (code, reason) => ws.close(code, reason),
              send: (m) => ws.send(m),
            };
            cleanupRevocation = this.revocationManager.registerSocket(activeSocket);

            // Send initial document state and auth confirmation
            const docState = Y.encodeStateAsUpdate(room.doc);
            const stateVector = Y.encodeStateVector(room.doc);

            ws.send(
              JSON.stringify({
                type: "auth.ok",
                roomId: room.roomId,
                fileId: authContext.fileId,
                role: authContext.role,
                action: authContext.action,
                lastPersistedSeq: room.lastPersistedSeq,
                stateVectorBase64: Buffer.from(stateVector).toString("base64"),
                updateBase64: Buffer.from(docState).toString("base64"),
              }),
            );
          } catch (err) {
            const authErr = err as AuthenticationError;
            ws.send(
              JSON.stringify({
                type: "error",
                code: authErr.code || "AUTHENTICATION_FAILED",
                message: authErr.message,
              }),
            );
            ws.close(authErr.code === "ORIGIN_NOT_ALLOWED" ? 4003 : 4401, authErr.code);
            return;
          }
          return;
        }

        // 2. Authenticated Message Processing
        if (!joinedRoom || !client.auth) return;

        let allowed = false;
        let canReconnectRead = false;
        try {
          allowed = await this.hasCurrentAccess(
            client.auth,
            msg.type === "sync.update" ? "write" : "read",
          );
          if (!allowed && msg.type === "sync.update") {
            canReconnectRead = await this.hasCurrentAccess(client.auth, "read");
          }
        } catch {
          ws.send(JSON.stringify({ type: "error", code: "DATABASE_UNAVAILABLE" }));
          ws.close(1011, "AUTH_UNAVAILABLE");
          return;
        }
        if (!allowed) {
          ws.send(JSON.stringify({ type: "error", code: "PERMISSION_DENIED" }));
          ws.close(
            canReconnectRead ? 1012 : 4403,
            canReconnectRead ? "ROLE_CHANGED" : "ACCESS_REVOKED",
          );
          return;
        }

        if (msg.type === "ping") {
          client.isAlive = true;
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (msg.type === "awareness") {
          client.isAlive = true;
          // Broadcast awareness to peers and Redis
          await this.broadcastAuthorized(
            joinedRoom,
            JSON.stringify({
              type: "awareness",
              userId: client.auth.userId,
              awareness: msg.awareness,
            }),
            ws,
          );
          if (this.redisCoordinator) {
            void this.redisCoordinator.broadcastAwareness(
              joinedRoom.roomId,
              msg.awareness,
              client.auth.userId,
            );
          }
          return;
        }

        if (msg.type === "sync.update") {
          // Reject write if connection is read-only
          if (client.auth.action === "read" || client.auth.role === "VIEWER") {
            ws.send(JSON.stringify({ type: "error", code: "PERMISSION_DENIED" }));
            return;
          }

          if (joinedRoom.isDeleted) {
            ws.send(JSON.stringify({ type: "error", code: "RESOURCE_NOT_FOUND" }));
            ws.close(4404, "RESOURCE_NOT_FOUND");
            return;
          }

          const updateBase64 = String(msg.updateBase64 ?? "");
          const updateBytes = Buffer.from(updateBase64, "base64");
          if (updateBytes.length === 0 || updateBytes.length > 1024 * 1024) {
            ws.send(JSON.stringify({ type: "error", code: "VALIDATION_ERROR" }));
            return;
          }

          if (!this.updateLog) {
            ws.send(JSON.stringify({ type: "error", code: "DATABASE_UNAVAILABLE" }));
            return;
          }

          const startTime = Date.now();
          try {
            const validationDoc = new Y.Doc();
            Y.applyUpdate(validationDoc, new Uint8Array(updateBytes));
            validationDoc.destroy();
          } catch {
            ws.send(JSON.stringify({ type: "error", code: "VALIDATION_ERROR" }));
            return;
          }
          try {
            // A failed commit must not alter the room or reach another client.
            const { seq } = await this.updateLog.appendUpdate(
              client.auth.fileId,
              client.auth.userId,
              new Uint8Array(updateBytes),
            );
            this.metrics.recordPersistenceLag(Date.now() - startTime);
            Y.applyUpdate(joinedRoom.doc, new Uint8Array(updateBytes));
            joinedRoom.lastPersistedSeq = Math.max(joinedRoom.lastPersistedSeq, seq);
            await this.broadcastAuthorized(
              joinedRoom,
              JSON.stringify({ type: "sync.update", updateBase64 }),
              ws,
            );
            if (this.redisCoordinator) {
              void this.redisCoordinator.broadcastUpdate(joinedRoom.roomId, updateBytes);
            }
            this.metrics.recordBroadcastLag(Date.now() - startTime);
            const ack: DurableAck = createDurableAck(client.auth.fileId, seq, joinedRoom.doc);
            ws.send(JSON.stringify(ack));
          } catch {
            ws.send(JSON.stringify({ type: "error", code: "DATABASE_UNAVAILABLE" }));
          }
          return;
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", code: "BAD_REQUEST" }));
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      this.metrics.recordConnectionClosed();
      cleanupRevocation?.();

      if (joinedRoom) {
        joinedRoom.clients.delete(client);
        if (joinedRoom.clients.size === 0) {
          // Retain room in cache or cleanup
        }
      }
    });
  }
}
