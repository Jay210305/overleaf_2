import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S09-T07: Verify concurrent review and file changes", () => {
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
      [`S09-T07 Test ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')`,
      [projectId, reviewer.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'doc.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-v1') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("stale anchors and hash mismatches yield 409 conflict and leave document unchanged", async () => {
    const sRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'replace', '1', '{}'::jsonb, 'actual-hash', 'new text', 'pending') RETURNING id`,
      [projectId, fileId, reviewer.id],
    );
    const suggId = sRes.rows[0]!.id;

    const ownerSession = await fixture.login(owner.email);
    const cookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerSession.headers["x-csrf-token"]);

    // Attempt accept with stale hash
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { decision: "accept", expectedOldTextHash: "stale-outdated-hash" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SUGGESTION_CONFLICT");

    // Document blob unchanged
    const node = await fixture.db.query<{ blob_key: string }>(
      `SELECT blob_key FROM project_nodes WHERE id = $1`,
      [fileId],
    );
    expect(node.rows[0]!.blob_key).toBe("blob-v1");

    // Suggestion marked as conflict
    const row = await fixture.db.query<{ status: string }>(
      `SELECT status FROM suggestions WHERE id = $1`,
      [suggId],
    );
    expect(row.rows[0]!.status).toBe("conflict");
  });

  it("reviewer cannot resolve or apply proposals directly (403)", async () => {
    const sRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'insert', '1', '{}'::jsonb, 'hash', 'more text', 'pending') RETURNING id`,
      [projectId, fileId, reviewer.id],
    );
    const suggId = sRes.rows[0]!.id;

    const revSession = await fixture.login(reviewer.email);
    const cookie = String(revSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(revSession.headers["x-csrf-token"]);

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { decision: "accept" },
    });

    expect(res.statusCode).toBe(403);
  });
});
