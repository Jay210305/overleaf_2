import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression COL-09 (S09-T05): Explicit single and bulk suggestion resolution", () => {
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
      [`COL-09 Single/Bulk ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')`,
      [projectId, reviewer.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'main.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-orig') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("ensures bulk resolution never labels an unapplied conflict as accepted", async () => {
    const ownerSession = await fixture.login(owner.email);
    const cookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerSession.headers["x-csrf-token"]);

    // Insert suggestion
    const sRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'insert', '1', '{}', 'hash-1', 'new text', 'pending') RETURNING id`,
      [projectId, fileId, reviewer.id],
    );
    const suggId = sRes.rows[0]!.id;

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/bulk-resolve`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        items: [{ id: suggId, decision: "accept", expectedOldTextHash: "different-hash" }],
      },
    });

    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results[0]!.status).toBe("conflict");

    const row = await fixture.db.query<{ status: string; resolved_by: string | null }>(
      `SELECT status, resolved_by FROM suggestions WHERE id = $1`,
      [suggId],
    );
    expect(row.rows[0]!.status).toBe("conflict");
    expect(row.rows[0]!.resolved_by).toBe(owner.id);
  });
});
