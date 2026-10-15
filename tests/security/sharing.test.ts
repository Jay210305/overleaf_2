import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import type {
  CollabInvalidationEvent,
  CollabInvalidationPublisher,
} from "../../apps/api/src/modules/collab/invalidation.js";
import { LiveRevocationManager } from "../../apps/collab/src/auth/revocation.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

function recordingPublisher() {
  const events: CollabInvalidationEvent[] = [];
  const publisher: CollabInvalidationPublisher = {
    async publish(event) {
      events.push(event);
    },
    async close() {},
  };
  return { events, publisher };
}

function fakeSocket(userId: string, projectId: string) {
  const sent: string[] = [];
  const closed: Array<{ code: number; reason: string }> = [];
  return {
    userId,
    projectId,
    sessionId: `session-${userId}`,
    action: "write" as const,
    sent,
    closed,
    close(code: number, reason: string) {
      closed.push({ code, reason });
    },
    send(message: string) {
      sent.push(message);
    },
  };
}

describe("S08-T08 sharing revocation closes collaboration access", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let recording: ReturnType<typeof recordingPublisher>;
  let projectId: string;
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let linked: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    recording = recordingPublisher();
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      collabInvalidation: recording.publisher,
    });
    owner = await fixture.seed();
    member = await fixture.seed();
    linked = await fixture.seed();
    projectId = randomUUID();
    await fixture.db.query("INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Revocation')", [
      projectId,
      owner.id,
    ]);
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')",
      [projectId, member.id],
    );
  });

  afterAll(async () => {
    if (app) await app.close();
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

  it("publishes member_removed when the owner removes a member", async () => {
    const ownerHeaders = await headers(owner.email);
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/members/${member.id}`,
      headers: ownerHeaders,
    });
    expect(removed.statusCode).toBe(204);
    expect(recording.events).toContainEqual({
      type: "member_removed",
      userId: member.id,
      projectId,
    });
    const memberHeaders = await headers(member.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/comments`,
          headers: memberHeaders,
          payload: { fileId: randomUUID(), body: "x" },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("closes the removed member's open collaboration socket from the published event", async () => {
    const manager = new LiveRevocationManager();
    const socket = fakeSocket(member.id, projectId);
    manager.registerSocket(socket);
    expect(manager.getActiveSocketCount()).toBe(1);
    const event = recording.events.find(
      (item): item is CollabInvalidationEvent => item.type === "member_removed",
    );
    expect(event).toBeDefined();
    await manager.handleRevocation(event!);
    expect(socket.closed).toEqual([{ code: 4403, reason: "MEMBER_REMOVED" }]);
    expect(manager.getActiveSocketCount()).toBe(0);
  });

  it("publishes role_changed when the owner demotes a member", async () => {
    const newcomer = await fixture.seed();
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')",
      [projectId, newcomer.id],
    );
    const ownerHeaders = await headers(owner.email);
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/members/${newcomer.id}`,
      headers: ownerHeaders,
      payload: { role: "VIEWER" },
    });
    expect(patched.statusCode).toBe(200);
    expect(recording.events).toContainEqual({
      type: "role_changed",
      userId: newcomer.id,
      projectId,
      newRole: "VIEWER",
    });
    const manager = new LiveRevocationManager();
    const socket = fakeSocket(newcomer.id, projectId);
    manager.registerSocket(socket);
    await manager.handleRevocation({
      type: "role_changed",
      userId: newcomer.id,
      projectId,
      newRole: "VIEWER",
    });
    expect(socket.action).toBe("read");
    expect(socket.closed).toEqual([]);
  });

  it("publishes member_removed for link-derived grants when the link is revoked", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "REVIEWER", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    expect(created.statusCode).toBe(201);
    const token = created.json().token as string;
    const linkId = created.json().link.id as string;
    const linkedHeaders = await headers(linked.email);
    const redeemed = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: linkedHeaders,
      payload: { token },
    });
    expect(redeemed.statusCode).toBe(200);
    const revoked = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/share-links/${linkId}`,
      headers: ownerHeaders,
    });
    expect(revoked.statusCode).toBe(204);
    expect(recording.events).toContainEqual({
      type: "member_removed",
      userId: linked.id,
      projectId,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: linkedHeaders,
          payload: { token },
        })
      ).statusCode,
    ).toBe(404);
  });
});
