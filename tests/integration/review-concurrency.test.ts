import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("Review Concurrency: Accept races, file delete, and stale anchors", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let projectId: string;
  let fileId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
    reviewer = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`Concurrency Review ${randomUUID()}`, owner.id],
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

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'main.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-base') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;
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

  async function createSuggestion(targetFileId: string, hash: string) {
    const sRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'replace', '1', '{}'::jsonb, $4, 'replacement text', 'pending') RETURNING id`,
      [projectId, targetFileId, reviewer.id, hash],
    );
    return sRes.rows[0]!.id;
  }

  it("prevents double-apply under concurrent accept race (exactly one 200, other 409)", async () => {
    const suggId = await createSuggestion(fileId, "race-hash-1");
    const ownerSession = await getSession(owner.email);
    const editorSession = await getSession(editor.email);

    // Fire two concurrent resolution requests
    const [res1, res2] = await Promise.all([
      fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
        headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
        payload: { decision: "accept", expectedOldTextHash: "race-hash-1" },
      }),
      fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
        headers: { origin, cookie: editorSession.cookie, "x-csrf-token": editorSession.csrf },
        payload: { decision: "accept", expectedOldTextHash: "race-hash-1" },
      }),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    expect(statusCodes).toEqual([200, 409]);

    // Check suggestion in DB has status accepted and exactly one resolved_by
    const check = await fixture.db.query<{ status: string; resolved_by: string }>(
      `SELECT status, resolved_by FROM suggestions WHERE id = $1`,
      [suggId],
    );
    expect(check.rows[0]!.status).toBe("accepted");
    expect([owner.id, editor.id]).toContain(check.rows[0]!.resolved_by);
  });

  it("fails with 409 and marks conflict when target file was deleted concurrently", async () => {
    // Create new file and suggestion
    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'temp.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-temp') RETURNING id`,
      [projectId],
    );
    const tempFileId = fRes.rows[0]!.id;
    const suggId = await createSuggestion(tempFileId, "temp-hash");

    // Soft delete file
    await fixture.db.query(
      `UPDATE project_nodes SET deleted_at = NOW() WHERE id = $1`,
      [tempFileId],
    );

    const ownerSession = await getSession(owner.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
      payload: { decision: "accept", expectedOldTextHash: "temp-hash" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SUGGESTION_CONFLICT");

    const check = await fixture.db.query<{ status: string }>(
      `SELECT status FROM suggestions WHERE id = $1`,
      [suggId],
    );
    expect(check.rows[0]!.status).toBe("conflict");
  });
});
