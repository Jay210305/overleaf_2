import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("S09-T06: Preserve current ACL and historical anchors on restore", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let originalOwner: { id: string; email: string };
  let currentOwner: { id: string; email: string };
  let editor: { id: string; email: string };
  let revokedCollaborator: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let projectId: string;
  let fileId1: string;
  let rev1No: number;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    originalOwner = await fixture.seed();
    currentOwner = await fixture.seed();
    editor = await fixture.seed();
    revokedCollaborator = await fixture.seed();
    reviewer = await fixture.seed();

    // 1. Create project initially owned by originalOwner
    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`Restore ACL Test ${randomUUID()}`, originalOwner.id],
    );
    projectId = pRes.rows[0]!.id;

    // Add revokedCollaborator as EDITOR in revision 1
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, revokedCollaborator.id],
    );

    // Create file 1 and file 2
    const f1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'doc.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-rev1-f1') RETURNING id`,
      [projectId],
    );
    fileId1 = f1.rows[0]!.id;

    await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'sec.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-rev1-f2') RETURNING id`,
      [projectId],
    );

    // Snapshot Revision 1
    const repo = new RevisionsRepository(fixture.db);
    const r1 = await repo.createStructuralRevision({
      projectId,
      authorId: originalOwner.id,
      source: "save",
      label: "v1.0 baseline",
    });
    rev1No = r1.revisionNo;

    // 2. State evolves to Revision 2:
    // Transfer ownership to currentOwner
    await fixture.db.query(`UPDATE projects SET owner_id = $1 WHERE id = $2`, [
      currentOwner.id,
      projectId,
    ]);
    // Add originalOwner as EDITOR
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, originalOwner.id],
    );
    // Add current editor
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, editor.id],
    );
    // Add reviewer
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')`,
      [projectId, reviewer.id],
    );
    // Revoke revokedCollaborator (remove from project_members)
    await fixture.db.query(`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, [
      projectId,
      revokedCollaborator.id,
    ]);

    // Update file 1 content in Revision 2
    await fixture.db.query(`UPDATE project_nodes SET blob_key = 'blob-rev2-f1' WHERE id = $1`, [
      fileId1,
    ]);

    // Snapshot Revision 2
    await repo.createStructuralRevision({
      projectId,
      authorId: currentOwner.id,
      source: "save",
      label: "v2.0 evolved",
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

  it("restores content while preserving current owner, memberships, and revoked status", async () => {
    const ownerSession = await getSession(currentOwner.email);

    // Add an open comment on fileId1
    const commentRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO comments (project_id, file_id, created_by, anchor_start_json, anchor_end_json, body, status)
       VALUES ($1, $2, $3, '{"line": 5}'::jsonb, '{"line": 6}'::jsonb, 'Check this paragraph', 'open')
       RETURNING id`,
      [projectId, fileId1, editor.id],
    );
    const commentId = commentRes.rows[0]!.id;

    // Add a pending suggestion on fileId1
    const suggRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'replace', '2', '{}'::jsonb, 'hash-old', 'new suggestion text', 'pending')
       RETURNING id`,
      [projectId, fileId1, reviewer.id],
    );
    const suggId = suggRes.rows[0]!.id;

    // Get current revision number
    const pCurrent = await fixture.db.query<{ current_revision: number }>(
      `SELECT current_revision FROM projects WHERE id = $1`,
      [projectId],
    );
    const currentRev = Number(pCurrent.rows[0]!.current_revision);

    // Restore to rev1No
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
      },
      payload: {
        revisionNo: rev1No,
        expectedRevision: currentRev,
        fileId: fileId1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.revisionNo).toBe(currentRev + 1);
    expect(body.changedNodeIds).toContain(fileId1);
    expect(body.detachedAnchorIds).toContain(commentId);

    // Invariant 1: current owner remains currentOwner (NOT reverted to originalOwner)
    const pCheck = await fixture.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(pCheck.rows[0]!.owner_id).toBe(currentOwner.id);

    // Invariant 2: revokedCollaborator is NOT revived
    const mCheck = await fixture.db.query<{ user_id: string }>(
      `SELECT user_id FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, revokedCollaborator.id],
    );
    expect(mCheck.rows.length).toBe(0);

    // Invariant 3: comment anchor is marked detached
    const cCheck = await fixture.db.query<{ status: string }>(
      `SELECT status FROM comments WHERE id = $1`,
      [commentId],
    );
    expect(cCheck.rows[0]!.status).toBe("detached");

    // Invariant 4: pending suggestion is marked conflict
    const sCheck = await fixture.db.query<{ status: string }>(
      `SELECT status FROM suggestions WHERE id = $1`,
      [suggId],
    );
    expect(sCheck.rows[0]!.status).toBe("conflict");
  });

  it("denies restore attempts by REVIEWER with 403 Forbidden", async () => {
    const revSession = await getSession(reviewer.email);
    const pCurrent = await fixture.db.query<{ current_revision: number }>(
      `SELECT current_revision FROM projects WHERE id = $1`,
      [projectId],
    );

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: {
        origin,
        cookie: revSession.cookie,
        "x-csrf-token": revSession.csrf,
      },
      payload: {
        revisionNo: rev1No,
        expectedRevision: Number(pCurrent.rows[0]!.current_revision),
      },
    });

    expect(res.statusCode).toBe(403);
  });
});
