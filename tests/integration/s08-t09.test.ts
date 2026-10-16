import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T09 comment anchor interactions", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let owner: { id: string; email: string };
  let reviewer: { id: string; email: string };
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
    projectId = randomUUID();
    fileId = randomUUID();
    document = new Y.Doc();
    document.getText("content").insert(0, "Before target after");
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Anchors')",
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
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')",
      [projectId, reviewer.id],
    );
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
    const start = text.toString().indexOf("target");
    expect(start).toBeGreaterThanOrEqual(0);
    return {
      fileId,
      anchorStart: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, start)),
      anchorEnd: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, start + 6)),
      selectedText: "target",
      body: "Follow this range",
    };
  }

  async function persistDocument(seq: number) {
    await fixture.db.query(
      "INSERT INTO crdt_updates (file_id, seq, actor_user_id, payload_bytes) VALUES ($1, $2, $3, $4)",
      [fileId, seq, owner.id, Buffer.from(Y.encodeStateAsUpdate(document))],
    );
    await fixture.db.query("UPDATE text_documents SET last_persisted_seq = $1 WHERE file_id = $2", [
      seq,
      fileId,
    ]);
  }

  it("follows an insertion before the range with shifted offsets", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor(),
    });
    expect(created.statusCode).toBe(201);
    const commentId = created.json().id as string;
    document.getText("content").insert(0, "new ");
    await persistDocument(2);
    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: commentId,
          detached: false,
          start: 11,
          end: 17,
          selectedText: "target",
        }),
      ]),
    );
  });

  it("detaches the range on deletion while keeping replies and mentions visible", async () => {
    const ownerHeaders = await headers(owner.email);
    const reviewerHeaders = await headers(reviewer.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
      payload: anchor(),
    });
    expect(created.statusCode).toBe(201);
    const commentId = created.json().id as string;
    const replied = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments/${commentId}/replies`,
      headers: reviewerHeaders,
      payload: { body: "Still relevant" },
    });
    expect(replied.statusCode).toBe(201);
    document.getText("content").delete(0, document.getText("content").length);
    document.getText("content").insert(0, "Rewritten source");
    await persistDocument(3);
    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: ownerHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: commentId,
          detached: true,
          detachedReason: "range_changed",
          body: "Follow this range",
          replies: [expect.objectContaining({ body: "Still relevant" })],
        }),
      ]),
    );
  });
});
