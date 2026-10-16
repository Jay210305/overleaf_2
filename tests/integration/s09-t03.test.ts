import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("S09-T03: Restore file or project with version guard", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };
  let outsider: { id: string; email: string };
  let projectId: string;
  let file1Id: string;
  let file2Id: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
    reviewer = await fixture.seed();
    viewer = await fixture.seed();
    outsider = await fixture.seed();

    // 1. Create project
    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`Restore Guard Test ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    // 2. Add members
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, editor.id],
    );
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')`,
      [projectId, reviewer.id],
    );
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')`,
      [projectId, viewer.id],
    );

    // 3. Add initial file nodes
    const f1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'main.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-v1-main') RETURNING id`,
      [projectId],
    );
    file1Id = f1.rows[0]!.id;

    // 4. Create Revision 1
    const revRepo = new RevisionsRepository(fixture.db);
    await revRepo.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "manual",
      label: "v1 baseline",
    });

    // 5. Add second file and update first file blob
    const f2 = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'extra.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-v2-extra') RETURNING id`,
      [projectId],
    );
    file2Id = f2.rows[0]!.id;

    await fixture.db.query(`UPDATE project_nodes SET blob_key = 'blob-v2-main' WHERE id = $1`, [
      file1Id,
    ]);

    // 6. Create Revision 2
    await revRepo.createStructuralRevision({
      projectId,
      authorId: editor.id,
      source: "manual",
      label: "v2 with extra file",
    });
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

  it("rejects restore when expectedRevision is stale with 409 conflict", async () => {
    const session = await getSession(owner.email);

    // Current revision is 2. Stale expectedRevision: 1
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        revisionNo: 1,
        expectedRevision: 1, // Stale!
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe("REVISION_CONFLICT");
  });

  it("successfully restores single file with expectedRevision and creates new immutable revision", async () => {
    const session = await getSession(editor.email);

    // Current revision is 2. Restore file1 to v1 state.
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        revisionNo: 1,
        expectedRevision: 2,
        fileId: file1Id,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.revisionNo).toBe(3);
    expect(body.changedNodeIds).toEqual([file1Id]);

    // Check that project current_revision is now 3
    const pCheck = await fixture.db.query<{ current_revision: number }>(
      `SELECT current_revision FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(Number(pCheck.rows[0]!.current_revision)).toBe(3);

    // Check that file1 blob_key was restored to 'blob-v1-main'
    const nCheck = await fixture.db.query<{ blob_key: string }>(
      `SELECT blob_key FROM project_nodes WHERE id = $1`,
      [file1Id],
    );
    expect(nCheck.rows[0]!.blob_key).toBe("blob-v1-main");

    // Check that file2 was NOT touched and remains active
    const f2Check = await fixture.db.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM project_nodes WHERE id = $1`,
      [file2Id],
    );
    expect(f2Check.rows[0]!.deleted_at).toBeNull();
  });

  it("denies restore by REVIEWER, VIEWER and outsider", async () => {
    const revSession = await getSession(reviewer.email);
    const resRev = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        origin,
        cookie: revSession.cookie,
        "x-csrf-token": revSession.csrf,
      },
      payload: {
        revisionNo: 1,
        expectedRevision: 3,
      },
    });
    expect(resRev.statusCode).toBe(403);

    const viewSession = await getSession(viewer.email);
    const resView = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        origin,
        cookie: viewSession.cookie,
        "x-csrf-token": viewSession.csrf,
      },
      payload: {
        revisionNo: 1,
        expectedRevision: 3,
      },
    });
    expect(resView.statusCode).toBe(403);

    const outSession = await getSession(outsider.email);
    const resOut = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        origin,
        cookie: outSession.cookie,
        "x-csrf-token": outSession.csrf,
      },
      payload: {
        revisionNo: 1,
        expectedRevision: 3,
      },
    });
    expect(resOut.statusCode).toBe(404);
  });

  it("preserves project ACLs and collaborator memberships after restore", async () => {
    // Current revision is 3. Full restore to v1.
    const session = await getSession(owner.email);

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        revisionNo: 1,
        expectedRevision: 3,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().revisionNo).toBe(4);

    // Verify owner has NOT changed
    const pCheck = await fixture.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(pCheck.rows[0]!.owner_id).toBe(owner.id);

    // Verify members and roles have NOT changed
    const mCheck = await fixture.db.query<{ user_id: string; role: string }>(
      `SELECT user_id, role FROM project_members WHERE project_id = $1 ORDER BY role`,
      [projectId],
    );
    expect(mCheck.rows).toHaveLength(3);
    const roles = mCheck.rows.map((r) => r.role);
    expect(roles).toContain("EDITOR");
    expect(roles).toContain("REVIEWER");
    expect(roles).toContain("VIEWER");
  });
});
