import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { createSessionFixture, origin } from "./s02-session.js";
import { CollabServer } from "../../apps/collab/src/server.js";
import { MemoryTicketStore } from "../../apps/collab/src/auth/ticket.js";
import { CollabRedisCoordinator } from "../../apps/collab/src/redis.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CollabTestMessage = { type: string; [key: string]: any };

export interface CollabTestFixture {
  sessionFixture: Awaited<ReturnType<typeof createSessionFixture>>;
  db: Awaited<ReturnType<typeof createSessionFixture>>["db"];
  app: Awaited<ReturnType<typeof createSessionFixture>>["app"];
  ticketStore: MemoryTicketStore;
  collabServer: CollabServer;
  collabPort: number;
  collabUrl: string;
  owner: { id: string; email: string };
  editor: { id: string; email: string };
  viewer: { id: string; email: string };
  projectId: string;
  fileId: string;
  createClient: (
    ticket: string,
    options?: {
      origin?: string;
      fileId?: string;
      projectId?: string;
      serverUrl?: string | undefined;
    },
  ) => Promise<{
    ws: WebSocket;
    initialSync: CollabTestMessage;
    send: (msg: unknown) => void;
    sendUpdate: (updateBytes: Uint8Array, timeoutMs?: number) => Promise<CollabTestMessage>;
    waitForMessage: (
      predicate: (msg: CollabTestMessage) => boolean,
      timeoutMs?: number,
    ) => Promise<CollabTestMessage>;
    close: () => Promise<void>;
  }>;
  getTicket: (userEmail: string, fileId: string, action?: "read" | "write") => Promise<string>;
  close: () => Promise<void>;
}

export async function createCollabTestFixture(options?: {
  redisCoordinator?: CollabRedisCoordinator;
}): Promise<CollabTestFixture> {
  const ticketStore = new MemoryTicketStore();
  const sessionFixture = await createSessionFixture(origin, false, undefined, ticketStore);
  const { db, app } = sessionFixture;

  const owner = await sessionFixture.seed();
  const editor = await sessionFixture.seed();
  const viewer = await sessionFixture.seed();

  // Create project
  const ownerSession = await loginUser(owner.email);
  const projRes = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: {
      origin,
      cookie: ownerSession.cookie,
      "x-csrf-token": ownerSession.csrf,
    },
    payload: {
      title: `Collab Project ${randomUUID()}`,
      compiler: "pdflatex",
    },
  });
  const project = projRes.json();
  const projectId = project.id;

  // Add editor and viewer
  await db.query(
    `INSERT INTO project_members (project_id, user_id, role, joined_at)
     VALUES ($1, $2, 'EDITOR', now()), ($1, $3, 'VIEWER', now())`,
    [projectId, editor.id, viewer.id],
  );

  const fileId = project.mainFileId!;

  // Collab server setup
  const httpServer = http.createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
  const addr = httpServer.address() as { port: number };
  const collabPort = addr.port;
  const collabUrl = `ws://127.0.0.1:${collabPort}`;

  const collabServer = new CollabServer({
    server: httpServer,
    allowedOrigin: origin,
    db,
    ticketStore,
    redisCoordinator: options?.redisCoordinator,
  });
  await collabServer.start();

  async function loginUser(email: string) {
    const res = await sessionFixture.login(email);
    return {
      cookie: String(res.headers["set-cookie"]).split(";")[0]!,
      csrf: String(res.headers["x-csrf-token"]),
    };
  }

  async function getTicket(
    userEmail: string,
    targetFileId: string,
    action: "read" | "write" = "write",
  ) {
    const s = await loginUser(userEmail);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/collab-ticket`,
      headers: {
        origin,
        cookie: s.cookie,
        "x-csrf-token": s.csrf,
      },
      payload: {
        fileId: targetFileId,
        action,
      },
    });
    if (res.statusCode !== 200) {
      throw new Error(`Failed to get ticket: ${res.statusCode} ${res.body}`);
    }
    return res.json().ticket;
  }

  async function createClient(
    ticket: string,
    clientOptions?: {
      origin?: string;
      fileId?: string;
      projectId?: string;
      serverUrl?: string | undefined;
    },
  ) {
    const clientOrigin = clientOptions?.origin ?? origin;
    const targetUrl = clientOptions?.serverUrl ?? collabUrl;
    const ws = new WebSocket(targetUrl, {
      headers: {
        origin: clientOrigin,
      },
    });

    const messages: CollabTestMessage[] = [];
    const listeners: Array<(msg: CollabTestMessage) => void> = [];

    ws.on("message", (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as CollabTestMessage;
        messages.push(parsed);
        for (const l of listeners) l(parsed);
      } catch {
        // ignore
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (e) => reject(e));
    });

    // Send auth message
    ws.send(
      JSON.stringify({
        type: "auth",
        ticket,
        projectId: clientOptions?.projectId ?? projectId,
        fileId: clientOptions?.fileId ?? fileId,
      }),
    );

    const initialSync = await new Promise<CollabTestMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for auth.ok")), 5000);
      const handler = (m: CollabTestMessage) => {
        if (m.type === "auth.ok") {
          clearTimeout(timer);
          resolve(m);
        } else if (m.type === "error") {
          clearTimeout(timer);
          reject(new Error(`Auth error: ${String(m.code)} - ${String(m.message)}`));
        }
      };
      listeners.push(handler);
    });

    async function sendUpdate(updateBytes: Uint8Array, timeoutMs = 5000) {
      const updateBase64 = Buffer.from(updateBytes).toString("base64");
      const ackPromise = new Promise<CollabTestMessage>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timeout waiting for durable ack")),
          timeoutMs,
        );
        const handler = (m: CollabTestMessage) => {
          if (m.type === "text.durable_ack" || m.type === "error") {
            clearTimeout(timer);
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
            resolve(m);
          }
        };
        listeners.push(handler);
      });
      ws.send(JSON.stringify({ type: "sync.update", updateBase64 }));
      return ackPromise;
    }

    async function waitForMessage(
      predicate: (msg: CollabTestMessage) => boolean,
      timeoutMs = 5000,
    ) {
      // Check already received messages
      for (const m of messages) {
        if (predicate(m)) return m;
      }
      return new Promise<CollabTestMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout waiting for message")), timeoutMs);
        const handler = (m: CollabTestMessage) => {
          if (predicate(m)) {
            clearTimeout(timer);
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
            resolve(m);
          }
        };
        listeners.push(handler);
      });
    }

    async function close() {
      ws.close();
    }

    function send(msg: unknown) {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    }

    return {
      ws,
      initialSync,
      send,
      sendUpdate,
      waitForMessage,
      close,
    };
  }

  async function close() {
    await collabServer.stop();
    await sessionFixture.close();
  }

  return {
    sessionFixture,
    db,
    app,
    ticketStore,
    collabServer,
    collabPort,
    collabUrl,
    owner,
    editor,
    viewer,
    projectId,
    fileId,
    createClient,
    getTicket,
    close,
  };
}
