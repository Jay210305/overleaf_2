import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("Regression COL-03 (S09-T06): Role authorization for restore action", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
    reviewer = await fixture.seed();
    viewer = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`COL-03 Auth Restore ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

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

    await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'doc.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-1') RETURNING id`,
      [projectId],
    );

    const revRepo = new RevisionsRepository(fixture.db);
    await revRepo.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "save",
      label: "v1 baseline",
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("permits restore by EDITOR and denies REVIEWER and VIEWER with 403", async () => {
    // 1. REVIEWER fails
    const revSession = await fixture.login(reviewer.email);
    const revCookie = String(revSession.headers["set-cookie"]).split(";")[0]!;
    const revCsrf = String(revSession.headers["x-csrf-token"]);

    const resRev = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: { origin, cookie: revCookie, "x-csrf-token": revCsrf },
      payload: { revisionNo: 1, expectedRevision: 1 },
    });
    expect(resRev.statusCode).toBe(403);

    // 2. VIEWER fails
    const viewSession = await fixture.login(viewer.email);
    const viewCookie = String(viewSession.headers["set-cookie"]).split(";")[0]!;
    const viewCsrf = String(viewSession.headers["x-csrf-token"]);

    const resView = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: { origin, cookie: viewCookie, "x-csrf-token": viewCsrf },
      payload: { revisionNo: 1, expectedRevision: 1 },
    });
    expect(resView.statusCode).toBe(403);

    // 3. EDITOR succeeds
    const edSession = await fixture.login(editor.email);
    const edCookie = String(edSession.headers["set-cookie"]).split(";")[0]!;
    const edCsrf = String(edSession.headers["x-csrf-token"]);

    const resEd = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: { origin, cookie: edCookie, "x-csrf-token": edCsrf },
      payload: { revisionNo: 1, expectedRevision: 1 },
    });
    expect(resEd.statusCode).toBe(200);
  });
});
