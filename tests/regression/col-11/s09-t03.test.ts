import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("Regression COL-11 (S09-T03): Restore file or project preserves current ACL", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let projectId: string;
  let fileId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    member = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`COL-11 Restore ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, member.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'main.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-v1') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;

    const revRepo = new RevisionsRepository(fixture.db);
    await revRepo.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "manual",
      label: "Initial v1",
    });

    await fixture.db.query(
      `UPDATE project_nodes SET blob_key = 'blob-v2' WHERE id = $1`,
      [fileId],
    );

    await revRepo.createStructuralRevision({
      projectId,
      authorId: member.id,
      source: "manual",
      label: "Modified v2",
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("restores file as a new revision without altering project members or ownership", async () => {
    const login = await fixture.login(member.email);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(login.headers["x-csrf-token"]);

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
    expect(body.revisionNo).toBe(3);

    // Verify ownership intact
    const pCheck = await fixture.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(pCheck.rows[0]!.owner_id).toBe(owner.id);

    // Verify member intact
    const mCheck = await fixture.db.query<{ role: string }>(
      `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, member.id],
    );
    expect(mCheck.rows[0]!.role).toBe("EDITOR");
  });
});
