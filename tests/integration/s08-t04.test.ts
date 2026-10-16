import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T04 anchored comments", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let owner: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };
  let projectId: string;
  let fileId: string;
  let document: Y.Doc;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../packages/db/migrations/0011-comment-context.sql"),
        "utf8",
      ),
    );
    owner = await fixture.seed();
    reviewer = await fixture.seed();
    viewer = await fixture.seed();
    projectId = randomUUID();
    fileId = randomUUID();
    document = new Y.Doc();
    document.getText("content").insert(0, "Before target after");
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Comments')",
      [projectId, owner.id],
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
      [fileId, owner.id, Buffer.from(Y.encodeStateAsUpdate(document))],
    );
    for (const [userId, role] of [
      [reviewer.id, "REVIEWER"],
      [viewer.id, "VIEWER"],
    ]) {
      await fixture.db.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)",
        [projectId, userId, role],
      );
    }
    app = createServer({ checkReadiness: async () => true, db: fixture.db, origin, logger: false });
  });

  afterAll(async () => {
    document?.destroy();
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

  function anchor() {
    const text = document.getText("content");
    return {
      fileId,
      anchorStart: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 7)),
      anchorEnd: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 13)),
      selectedText: "target",
      body: "Please check @reviewer",
    };
  }

  it("creates a durable thread, replies, resolves and reopens", async () => {
    const ownerHeaders = await headers(owner.email);
    const reviewerHeaders = await headers(reviewer.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor(),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      fileId,
      status: "open",
      selectedText: "target",
      detached: false,
    });
    const commentId = created.json().id as string;
    const replied = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments/${commentId}/replies`,
      headers: reviewerHeaders,
      payload: { body: "Agreed" },
    });
    expect(replied.statusCode).toBe(201);
    expect(replied.json()).toMatchObject({ commentId, authorId: reviewer.id, body: "Agreed" });
    for (const status of ["resolved", "open"]) {
      const changed = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${projectId}/comments/${commentId}`,
        headers: ownerHeaders,
        payload: { status },
      });
      expect(changed.statusCode).toBe(200);
      expect(changed.json().status).toBe(status);
    }
    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: reviewerHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: commentId,
          replies: [expect.objectContaining({ body: "Agreed" })],
        }),
      ]),
    );
  });

  it("denies viewer writes, foreign IDs and unsafe bodies without changing state", async () => {
    const ownerHeaders = await headers(owner.email);
    const viewerHeaders = await headers(viewer.email);
    const path = `/api/v1/projects/${projectId}/comments`;
    expect(
      (await app.inject({ method: "POST", url: path, headers: viewerHeaders, payload: anchor() }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: path,
          headers: ownerHeaders,
          payload: { ...anchor(), body: "<script>alert(1)</script>" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: path,
          headers: ownerHeaders,
          payload: { ...anchor(), body: "a".repeat(10001) },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: path,
          headers: ownerHeaders,
          payload: { ...anchor(), fileId: randomUUID() },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: path,
          headers: { ...ownerHeaders, "x-csrf-token": "forged" },
          payload: anchor(),
        })
      ).statusCode,
    ).toBe(403);
  });

  it("detaches a deleted selected range rather than attaching to adjacent source", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor(),
    });
    expect(created.statusCode).toBe(201);
    document.getText("content").delete(7, 6);
    await fixture.db.query(
      "INSERT INTO crdt_updates (file_id, seq, actor_user_id, payload_bytes) VALUES ($1, 2, $2, $3)",
      [fileId, owner.id, Buffer.from(Y.encodeStateAsUpdate(document))],
    );
    await fixture.db.query("UPDATE text_documents SET last_persisted_seq = 2 WHERE file_id = $1", [
      fileId,
    ]);
    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.json().id,
          detached: true,
          detachedReason: "range_changed",
        }),
      ]),
    );
  });
});
