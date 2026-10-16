import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression COL-08 (S09-T07): Reviewer mode prevents modifying canonical text", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let projectId: string;
  let fileId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    reviewer = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`COL-08 Mode Check ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')`,
      [projectId, reviewer.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'doc.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-orig') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("denies reviewer direct restore and direct resolve", async () => {
    const revSession = await fixture.login(reviewer.email);
    const cookie = String(revSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(revSession.headers["x-csrf-token"]);

    // Attempt direct restore
    const resRestore = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { revisionNo: 1, expectedRevision: 1 },
    });
    expect(resRestore.statusCode).toBe(403);

    // Attempt direct resolve
    const sRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'insert', '1', '{}', 'h', 'txt', 'pending') RETURNING id`,
      [projectId, fileId, reviewer.id],
    );
    const resResolve = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${sRes.rows[0]!.id}/resolve`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { decision: "accept" },
    });
    expect(resResolve.statusCode).toBe(403);
  });
});
