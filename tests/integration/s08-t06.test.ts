import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T06 mention notifications", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let fileId: string;
  let owner: { id: string; email: string };
  let recipient: { id: string; email: string };
  let outsider: { id: string; email: string };
  let doc: Y.Doc;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    for (const migration of ["0011-comment-context.sql", "0012-notification-idempotency.sql"])
      await fixture.db.query(
        readFileSync(
          resolve(import.meta.dirname, "../../packages/db/migrations", migration),
          "utf8",
        ),
      );
    owner = await fixture.seed();
    recipient = await fixture.seed();
    outsider = await fixture.seed();
    projectId = randomUUID();
    fileId = randomUUID();
    doc = new Y.Doc();
    doc.getText("content").insert(0, "A target paragraph");
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Notifications')",
      [projectId, owner.id],
    );
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')",
      [projectId, recipient.id],
    );
    await fixture.db.query(
      "INSERT INTO project_nodes (id, project_id, name, kind, mime, content_kind) VALUES ($1, $2, 'main.tex', 'FILE', 'text/x-tex', 'TEXT')",
      [fileId, projectId],
    );
    await fixture.db.query(
      "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
      [fileId, projectId],
    );
    await fixture.db.query(
      "INSERT INTO crdt_updates (file_id, seq, actor_user_id, payload_bytes) VALUES ($1, 1, $2, $3)",
      [fileId, owner.id, Buffer.from(Y.encodeStateAsUpdate(doc))],
    );
  });

  afterAll(async () => {
    doc?.destroy();
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

  function anchor(mentions: string[]) {
    const text = doc.getText("content");
    return {
      fileId,
      anchorStart: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 2)),
      anchorEnd: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 8)),
      selectedText: "target",
      body: "Please review",
      mentions,
    };
  }

  it("delivers one private notification per mentioned recipient and allows mark read", async () => {
    const ownerHeaders = await headers(owner.email);
    const recipientHeaders = await headers(recipient.email);
    const outsiderHeaders = await headers(outsider.email);
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor([recipient.id]),
    });
    expect(created.statusCode).toBe(201);
    const listed = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me/notifications",
      headers: recipientHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(1);
    expect(listed.json().items[0]).toMatchObject({
      projectId,
      sourceId: created.json().id,
      type: "mention",
      readAt: null,
    });
    expect(JSON.stringify(listed.json())).not.toContain("Please review");
    const notificationId = listed.json().items[0].id as string;
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/me/notifications",
          headers: outsiderHeaders,
        })
      ).json().items,
    ).toHaveLength(0);
    expect(
      (
        await fixture.app.inject({
          method: "PATCH",
          url: `/api/v1/me/notifications/${notificationId}/read`,
          headers: outsiderHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    const read = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/me/notifications/${notificationId}/read`,
      headers: recipientHeaders,
      payload: {},
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().readAt).toEqual(expect.any(String));
    const repeat = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/me/notifications/${notificationId}/read`,
      headers: recipientHeaders,
      payload: {},
    });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().readAt).toBe(read.json().readAt);
    const deniedCsrf = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/me/notifications/${notificationId}/read`,
      headers: { ...recipientHeaders, "x-csrf-token": "invalid" },
      payload: {},
    });
    expect(deniedCsrf.statusCode).toBe(403);

    const reply = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments/${created.json().id}/replies`,
      headers: recipientHeaders,
      payload: { body: "I will check" },
    });
    expect(reply.statusCode).toBe(201);
    const ownerFeed = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me/notifications",
      headers: ownerHeaders,
    });
    expect(ownerFeed.statusCode).toBe(200);
    expect(ownerFeed.json().items).toMatchObject([
      { type: "reply", sourceId: reply.json().id, projectId },
    ]);
  });

  it("respects disabled mention preference and revocation, and rejects foreign mentions", async () => {
    const ownerHeaders = await headers(owner.email);
    const recipientHeaders = await headers(recipient.email);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/comments`,
          headers: ownerHeaders,
          payload: anchor([outsider.id]),
        })
      ).statusCode,
    ).toBe(400);
    await fixture.db.query(
      "INSERT INTO user_preferences (user_id, notification_settings_json) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET notification_settings_json = $2",
      [recipient.id, JSON.stringify({ inApp: true, mentions: false })],
    );
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor([recipient.id]),
    });
    expect(created.statusCode).toBe(201);
    const before = await fixture.db.query<{ id: string; count: string }>(
      "SELECT id, COUNT(*) OVER ()::text AS count FROM notifications WHERE user_id = $1",
      [recipient.id],
    );
    expect(before.rows[0]?.count).toBe("1");
    await fixture.db.query(
      "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
      [projectId, recipient.id],
    );
    const hidden = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me/notifications",
      headers: recipientHeaders,
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().items).toHaveLength(0);
    const deniedRead = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/me/notifications/${before.rows[0]!.id}/read`,
      headers: recipientHeaders,
      payload: {},
    });
    expect(deniedRead.statusCode).toBe(404);
  });
});
