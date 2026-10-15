import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("Regression COL-06 (S09-T06): Relative-position comment anchors become detached on restore", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let commenter: { id: string; email: string };
  let projectId: string;
  let fileId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    commenter = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`COL-06 Anchor Detach ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, commenter.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'chapter1.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-orig') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;

    const revRepo = new RevisionsRepository(fixture.db);
    await revRepo.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "save",
      label: "v1 original text",
    });

    // v2: text modified
    await fixture.db.query(
      `UPDATE project_nodes SET blob_key = 'blob-modified' WHERE id = $1`,
      [fileId],
    );
    await revRepo.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "save",
      label: "v2 edited text",
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("marks open comment as detached when restoring replaced content", async () => {
    // Add open comment on file
    const cRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO comments (project_id, file_id, created_by, anchor_start_json, anchor_end_json, body, status)
       VALUES ($1, $2, $3, '{"offset": 100}'::jsonb, '{"offset": 150}'::jsonb, 'Needs citation', 'open')
       RETURNING id`,
      [projectId, fileId, commenter.id],
    );
    const commentId = cRes.rows[0]!.id;

    const ownerSession = await fixture.login(owner.email);
    const cookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerSession.headers["x-csrf-token"]);

    // Restore to v1
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        revisionNo: 1,
        expectedRevision: 2,
        fileId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.detachedAnchorIds).toContain(commentId);

    const row = await fixture.db.query<{ status: string }>(
      `SELECT status FROM comments WHERE id = $1`,
      [commentId],
    );
    expect(row.rows[0]!.status).toBe("detached");
  });
});
