import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("Regression COL-11 (S09-T06): Restore preserves current ACL and revocation", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let revokedUser: { id: string; email: string };
  let currentEditor: { id: string; email: string };
  let projectId: string;
  let fileId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    revokedUser = await fixture.seed();
    currentEditor = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`COL-11 ACL Revoke ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    // Initially revokedUser was a member in v1
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, revokedUser.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'doc.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-v1') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;

    const revRepo = new RevisionsRepository(fixture.db);
    await revRepo.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "save",
      label: "v1 with old member",
    });

    // In v2: revokedUser is removed, currentEditor added, file updated
    await fixture.db.query(`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, [
      projectId,
      revokedUser.id,
    ]);
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, currentEditor.id],
    );
    await fixture.db.query(`UPDATE project_nodes SET blob_key = 'blob-v2' WHERE id = $1`, [fileId]);

    await revRepo.createStructuralRevision({
      projectId,
      authorId: currentEditor.id,
      source: "save",
      label: "v2 after revocation",
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("restoring v1 never revives revoked members", async () => {
    const ownerSession = await fixture.login(owner.email);
    const cookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerSession.headers["x-csrf-token"]);

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        revisionNo: 1,
        expectedRevision: 2,
      },
    });

    expect(res.statusCode).toBe(200);

    // Ensure revokedUser is STILL not a member
    const check = await fixture.db.query(
      `SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, revokedUser.id],
    );
    expect(check.rows.length).toBe(0);

    // Ensure currentEditor is STILL an EDITOR
    const checkEditor = await fixture.db.query<{ role: string }>(
      `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, currentEditor.id],
    );
    expect(checkEditor.rows[0]!.role).toBe("EDITOR");
  });
});
