import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("S08-T08 resolve, permission-aware delete and detached view (COL-06)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let fileId: string;
  let owner: { id: string; email: string };
  let author: { id: string; email: string };
  let stranger: { id: string; email: string };
  let doc: Y.Doc;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../../packages/db/migrations/0011-comment-context.sql"),
        "utf8",
      ),
    );
    owner = await fixture.seed();
    author = await fixture.seed();
    stranger = await fixture.seed();
    projectId = randomUUID();
    fileId = randomUUID();
    doc = new Y.Doc();
    doc.getText("content").insert(0, "Deletable anchored paragraph");
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Delete guard')",
      [projectId, owner.id],
    );
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER'), ($1, $3, 'REVIEWER')",
      [projectId, author.id, stranger.id],
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

  function anchor(body = "delete me") {
    const text = doc.getText("content");
    return {
      fileId,
      anchorStart: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 0)),
      anchorEnd: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 9)),
      selectedText: "Deletable",
      body,
      mentions: [],
    };
  }

  it("cycles resolve and reopen without losing the thread", async () => {
    const authorHeaders = await headers(author.email);
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: authorHeaders,
      payload: anchor("resolve cycle"),
    });
    expect(created.statusCode).toBe(201);
    const commentId = created.json().id as string;
    for (const status of ["resolved", "open", "resolved"] as const) {
      const patched = await fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${projectId}/comments/${commentId}`,
        headers: authorHeaders,
        payload: { status },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().status).toBe(status);
      expect(patched.json().body).toBe("resolve cycle");
    }
  });

  it("restricts deletion to the author or the owner", async () => {
    const authorHeaders = await headers(author.email);
    const strangerHeaders = await headers(stranger.email);
    const ownerHeaders = await headers(owner.email);
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: authorHeaders,
      payload: anchor("guarded"),
    });
    expect(created.statusCode).toBe(201);
    const commentId = created.json().id as string;
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/comments/${commentId}`,
          headers: strangerHeaders,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/comments/${commentId}`,
          headers: authorHeaders,
        })
      ).statusCode,
    ).toBe(204);
    const second = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: authorHeaders,
      payload: anchor("guarded again"),
    });
    expect(second.statusCode).toBe(201);
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/comments/${second.json().id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/comments/${second.json().id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(404);
  });
});
