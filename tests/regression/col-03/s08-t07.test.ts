import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("S08-T07 role enforcement on comment, reply and chat writes (COL-03)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let fileId: string;
  let commentId: string;
  let users: Record<"owner" | "editor" | "reviewer" | "viewer", { id: string; email: string }>;
  let doc: Y.Doc;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    for (const migration of ["0011-comment-context.sql", "0012-notification-idempotency.sql"])
      await fixture.db.query(
        readFileSync(
          resolve(import.meta.dirname, "../../../packages/db/migrations", migration),
          "utf8",
        ),
      );
    const owner = await fixture.seed();
    const editor = await fixture.seed();
    const reviewer = await fixture.seed();
    const viewer = await fixture.seed();
    users = { owner, editor, reviewer, viewer };
    projectId = randomUUID();
    fileId = randomUUID();
    doc = new Y.Doc();
    doc.getText("content").insert(0, "Role matrix paragraph");
    await fixture.db.query("INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Roles')", [
      projectId,
      owner.id,
    ]);
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR'), ($1, $3, 'REVIEWER'), ($1, $4, 'VIEWER')",
      [projectId, editor.id, reviewer.id, viewer.id],
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
    const text = doc.getText("content");
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: await headers(owner.email),
      payload: {
        fileId,
        anchorStart: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 0)),
        anchorEnd: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 4)),
        selectedText: "Role",
        body: "matrix seed",
        mentions: [],
      },
    });
    expect(created.statusCode).toBe(201);
    commentId = created.json().id as string;
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

  function anchor(body: string) {
    const text = doc.getText("content");
    return {
      fileId,
      anchorStart: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 0)),
      anchorEnd: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 4)),
      selectedText: "Role",
      body,
      mentions: [],
    };
  }

  it.each(["owner", "editor", "reviewer"] as const)("allows %s comment writes", async (who) => {
    const response = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments`,
      headers: await headers(users[who].email),
      payload: anchor(`${who} comment`),
    });
    expect(response.statusCode).toBe(201);
  });

  it.each(["owner", "editor", "reviewer"] as const)("allows %s reply and chat writes", async (who) => {
    const reply = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/comments/${commentId}/replies`,
      headers: await headers(users[who].email),
      payload: { body: `${who} reply` },
    });
    expect(reply.statusCode).toBe(201);
    const chat = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/chat/messages`,
      headers: await headers(users[who].email),
      payload: { body: `${who} chat` },
    });
    expect(chat.statusCode).toBe(201);
  });

  it("denies every viewer write with 403 and preserves state", async () => {
    const viewerHeaders = await headers(users.viewer.email);
    const before = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM chat_messages WHERE project_id = $1",
      [projectId],
    );
    for (const request of [
      { method: "POST", url: `/api/v1/projects/${projectId}/comments`, payload: anchor("nope") },
      {
        method: "POST",
        url: `/api/v1/projects/${projectId}/comments/${commentId}/replies`,
        payload: { body: "nope" },
      },
      {
        method: "POST",
        url: `/api/v1/projects/${projectId}/chat/messages`,
        payload: { body: "nope" },
      },
    ] as const) {
      const response = await fixture.app.inject({ ...request, headers: viewerHeaders });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("PROJECT_PERMISSION_DENIED");
    }
    const after = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM chat_messages WHERE project_id = $1",
      [projectId],
    );
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });
});
