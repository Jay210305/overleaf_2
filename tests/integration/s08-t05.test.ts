import { randomUUID } from "node:crypto";
import { once } from "node:events";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T05 authorized durable project chat", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let otherProjectId: string;
  let owner: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    reviewer = await fixture.seed();
    viewer = await fixture.seed();
    projectId = randomUUID();
    otherProjectId = randomUUID();
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Chat'), ($3, $2, 'Other')",
      [projectId, owner.id, otherProjectId],
    );
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER'), ($1, $3, 'VIEWER')",
      [projectId, reviewer.id, viewer.id],
    );
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  async function headers(email: string) {
    const login = await fixture.login(email);
    expect(login.statusCode).toBe(200);
    return {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(login.headers["x-csrf-token"]),
    };
  }

  it("persists ordered pages across server instances", async () => {
    const ownerHeaders = await headers(owner.email);
    const reviewerHeaders = await headers(reviewer.email);
    const path = `/api/v1/projects/${projectId}/chat/messages`;
    for (const body of ["First", "Second", "Third"]) {
      const response = await fixture.app.inject({
        method: "POST",
        url: path,
        headers: ownerHeaders,
        payload: { body },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ projectId, authorId: owner.id, body });
    }
    const restarted = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
    });
    try {
      const first = await restarted.inject({
        method: "GET",
        url: `${path}?limit=2`,
        headers: reviewerHeaders,
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().items).toHaveLength(2);
      expect(first.json().nextCursor).toEqual(expect.any(String));
      const second = await restarted.inject({
        method: "GET",
        url: `${path}?limit=2&cursor=${encodeURIComponent(first.json().nextCursor)}`,
        headers: reviewerHeaders,
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().items).toHaveLength(1);
      expect(
        new Set(
          [...first.json().items, ...second.json().items].map((item: { id: string }) => item.id),
        ).size,
      ).toBe(3);
      expect(second.json().nextCursor).toBeNull();
    } finally {
      await restarted.close();
    }
    const reply = await fixture.app.inject({
      method: "POST",
      url: path,
      headers: reviewerHeaders,
      payload: { body: "Reviewer update" },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toMatchObject({ authorId: reviewer.id, body: "Reviewer update" });
  });

  it("denies viewer writes, foreign projects and unsafe bodies without storing them", async () => {
    const ownerHeaders = await headers(owner.email);
    const viewerHeaders = await headers(viewer.email);
    const path = `/api/v1/projects/${projectId}/chat/messages`;
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: path,
          headers: viewerHeaders,
          payload: { body: "No" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await fixture.app.inject({ method: "GET", url: path, headers: viewerHeaders })).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/v1/projects/${otherProjectId}/chat/messages`,
          headers: viewerHeaders,
          payload: { body: "No" },
        })
      ).statusCode,
    ).toBe(404);
    for (const body of ["<script>alert(1)</script>", "x".repeat(10001), "  "]) {
      expect(
        (
          await fixture.app.inject({
            method: "POST",
            url: path,
            headers: ownerHeaders,
            payload: { body },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: path,
          headers: { ...ownerHeaders, "x-csrf-token": "invalid" },
          payload: { body: "Missing CSRF" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: `${path}?cursor=bad`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(400);
    const found = await fixture.db.query<{ body: string }>(
      "SELECT body FROM chat_messages WHERE project_id = $1",
      [projectId],
    );
    expect(found.rows.map((row) => row.body)).not.toContain("No");
    expect(found.rows.map((row) => row.body)).not.toContain("<script>alert(1)</script>");
    expect(found.rows.map((row) => row.body)).not.toContain("Missing CSRF");
  });

  it("sends only authorized invalidation hints and closes a revoked socket", async () => {
    const ownerHeaders = await headers(owner.email);
    const reviewerHeaders = await headers(reviewer.email);
    const app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    const url = `ws://127.0.0.1:${address.port}/api/v1/projects/${projectId}/chat/events`;
    const socket = new WebSocket(url, { headers: { origin, cookie: reviewerHeaders.cookie } });
    const nextHint = new Promise<{ type: string; payload: { messageId: string } }>(
      (resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Missing chat invalidation")), 5000);
        socket.on("message", (raw) => {
          const frame = JSON.parse(raw.toString()) as {
            type: string;
            payload: { messageId: string };
          };
          if (frame.type !== "chat.created") return;
          clearTimeout(timer);
          resolve(frame);
        });
      },
    );
    try {
      await once(socket, "open");
      const post = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/chat/messages`,
        headers: ownerHeaders,
        payload: { body: "Socket refresh" },
      });
      expect(post.statusCode).toBe(201);
      expect(await nextHint).toMatchObject({
        type: "chat.created",
        payload: { messageId: post.json().id },
      });
      const closed = once(socket, "close");
      await fixture.db.query(
        "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
        [projectId, reviewer.id],
      );
      await closed;
      const viewerHeaders = await headers(viewer.email);
      const denied = new WebSocket(url, { headers: { origin, cookie: viewerHeaders.cookie } });
      const result = await new Promise<string>((resolve) => {
        denied.on("open", () => resolve("open"));
        denied.on("error", () => resolve("denied"));
      });
      expect(result).toBe("denied");
      denied.terminate();
    } finally {
      socket.terminate();
      await app.close();
    }
  });
});
