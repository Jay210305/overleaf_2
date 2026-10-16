import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S09-T04: Model reviewer suggestions separately", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };
  let outsider: { id: string; email: string };
  let projectId: string;
  let fileId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    reviewer = await fixture.seed();
    viewer = await fixture.seed();
    outsider = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`Reviewer Suggestions ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')`,
      [projectId, reviewer.id],
    );
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')`,
      [projectId, viewer.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'chapter1.tex', 'FILE', 'application/x-tex', 'TEXT', 'canonical-blob-1') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;

    await fixture.db.query(`INSERT INTO text_documents (file_id, project_id) VALUES ($1, $2)`, [
      fileId,
      projectId,
    ]);
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("allows REVIEWER to create insert/delete/replace suggestions while canonical text stays unchanged", async () => {
    const session = await getSession(reviewer.email);

    // 1. Propose insert
    const insertRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        fileId,
        kind: "insert",
        baseRevision: "1",
        anchor: { index: 10, relativePath: "p1" },
        oldTextHash: "hash-original",
        newText: "\\cite{einstein1905}",
      },
    });

    expect(insertRes.statusCode).toBe(201);
    const insertBody = insertRes.json();
    expect(insertBody.kind).toBe("insert");
    expect(insertBody.status).toBe("pending");
    expect(insertBody.authorId).toBe(reviewer.id);

    // 2. Propose delete
    const deleteRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        fileId,
        kind: "delete",
        baseRevision: "1",
        anchor: { index: 50, length: 12 },
        oldTextHash: "hash-to-delete",
        newText: "",
      },
    });

    expect(deleteRes.statusCode).toBe(201);
    expect(deleteRes.json().kind).toBe("delete");

    // 3. Propose replace
    const replaceRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        fileId,
        kind: "replace",
        baseRevision: "1",
        anchor: { index: 100, length: 5 },
        oldTextHash: "hash-typo",
        newText: "corrected",
      },
    });

    expect(replaceRes.statusCode).toBe(201);
    expect(replaceRes.json().kind).toBe("replace");

    // Invariant verification: Canonical node is completely unchanged!
    const nodeCheck = await fixture.db.query<{ blob_key: string }>(
      `SELECT blob_key FROM project_nodes WHERE id = $1`,
      [fileId],
    );
    expect(nodeCheck.rows[0]!.blob_key).toBe("canonical-blob-1");
  });

  it("lists all suggestions for project and single file", async () => {
    const session = await getSession(owner.email);

    const listRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/suggestions?fileId=${fileId}&status=pending`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });

    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list).toHaveLength(3);
    expect(list.every((s: { status: string }) => s.status === "pending")).toBe(true);
  });

  it("denies suggestion creation by VIEWER and outsider", async () => {
    const viewerSession = await getSession(viewer.email);
    const viewRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
        "x-csrf-token": viewerSession.csrf,
      },
      payload: {
        fileId,
        kind: "insert",
        baseRevision: "1",
        anchor: { index: 0 },
        oldTextHash: "h",
        newText: "Unauthorized",
      },
    });
    expect(viewRes.statusCode).toBe(403);

    const outsiderSession = await getSession(outsider.email);
    const outRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions`,
      headers: {
        origin,
        cookie: outsiderSession.cookie,
        "x-csrf-token": outsiderSession.csrf,
      },
      payload: {
        fileId,
        kind: "insert",
        baseRevision: "1",
        anchor: { index: 0 },
        oldTextHash: "h",
        newText: "Outsider",
      },
    });
    expect(outRes.statusCode).toBe(404);
  });
});
