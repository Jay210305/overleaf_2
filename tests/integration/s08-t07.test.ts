import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T07 comment and chat safety", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let otherProjectId: string;
  let fileId: string;
  let owner: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };
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
    reviewer = await fixture.seed();
    viewer = await fixture.seed();
    outsider = await fixture.seed();
    projectId = randomUUID();
    otherProjectId = randomUUID();
    fileId = randomUUID();
    doc = new Y.Doc();
    doc.getText("content").insert(0, "A reviewable paragraph for safety checks");
    for (const [id, ownerId] of [
      [projectId, owner.id],
      [otherProjectId, owner.id],
    ] as const) {
      await fixture.db.query(
        "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Safety')",
        [id, ownerId],
      );
    }
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER'), ($1, $3, 'VIEWER')",
      [projectId, reviewer.id, viewer.id],
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

  function anchor(body: string, mentions: string[] = []) {
    const text = doc.getText("content");
    return {
      fileId,
      anchorStart: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 2)),
      anchorEnd: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 10)),
      selectedText: "reviewab",
      body,
      mentions,
    };
  }

  async function commentCount() {
    const found = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM comments WHERE project_id = $1",
      [projectId],
    );
    return found.rows[0]!.count;
  }

  it("rejects viewer writes while reviewer and owner writes pass", async () => {
    const ownerHeaders = await headers(owner.email);
    const reviewerHeaders = await headers(reviewer.email);
    const viewerHeaders = await headers(viewer.email);
    const outsiderHeaders = await headers(outsider.email);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/comments`,
          headers: viewerHeaders,
          payload: anchor("viewer comment"),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/comments`,
          headers: outsiderHeaders,
          payload: anchor("outsider comment"),
        })
      ).statusCode,
    ).toBe(404);
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: reviewerHeaders,
      payload: anchor("reviewer **comment**"),
    });
    expect(created.statusCode).toBe(201);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/comments/${created.json().id}/replies`,
          headers: viewerHeaders,
          payload: { body: "viewer reply" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/chat/messages`,
          headers: viewerHeaders,
          payload: { body: "viewer chat" },
        })
      ).statusCode,
    ).toBe(403);
    const chat = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/chat/messages`,
      headers: ownerHeaders,
      payload: { body: "owner chat" },
    });
    expect(chat.statusCode).toBe(201);
  });

  it("rejects XSS and oversized bodies and leaves state safe", async () => {
    const ownerHeaders = await headers(owner.email);
    const before = await commentCount();
    for (const body of [
      `<script>alert("xss")</script>`,
      `<img src="x" onerror="alert(1)">`,
      `[click](javascript:alert(1))`,
      // Passes the Zod shape (no angle brackets, no javascript:/data: scheme) so this
      // case proves the safety module itself rejects dangerous schemes.
      `[click](vbscript:msgbox(1))`,
      "x".repeat(10_001),
    ]) {
      const denied = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/comments`,
        headers: ownerHeaders,
        payload: anchor(body),
      });
      expect(denied.statusCode).toBe(400);
      expect(
        (
          await fixture.app.inject({
            method: "POST",
            url: `/api/v1/projects/${projectId}/chat/messages`,
            headers: ownerHeaders,
            payload: { body },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(await commentCount()).toBe(before);
  });

  it("stores safe markdown byte-for-byte", async () => {
    const ownerHeaders = await headers(owner.email);
    // Angle brackets never reach the safety layer: the shared Zod body shape already
    // rejects `<`, `>` and control characters, so this body stays inside that shape.
    const body = `Review **section 2**: see [the docs](https://example.com/guide), \`\\textbf{x}\` and $x^2$; note a is less than b.`;
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor(body),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().body).toBe(body);
    const chat = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/chat/messages`,
      headers: ownerHeaders,
      payload: { body },
    });
    expect(chat.statusCode).toBe(201);
    expect(chat.json().body).toBe(body);
  });

  it("rejects wrong-project anchors and revoked writers", async () => {
    const ownerHeaders = await headers(owner.email);
    const reviewerHeaders = await headers(reviewer.email);
    const foreign = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${otherProjectId}/comments`,
      headers: ownerHeaders,
      payload: anchor("foreign file anchor"),
    });
    expect([400, 404, 409]).toContain(foreign.statusCode);
    await fixture.db.query(
      "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
      [projectId, reviewer.id],
    );
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/chat/messages`,
          headers: reviewerHeaders,
          payload: { body: "revoked chat" },
        })
      ).statusCode,
    ).toBe(404);
    await fixture.db.query(
      "UPDATE project_members SET revoked_at = NULL WHERE project_id = $1 AND user_id = $2",
      [projectId, reviewer.id],
    );
  });
});
