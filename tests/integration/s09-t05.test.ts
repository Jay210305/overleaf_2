import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S09-T05: Resolve proposals with explicit conflicts", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };
  let projectId: string;
  let fileId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
    reviewer = await fixture.seed();
    viewer = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`Resolve Proposals ${randomUUID()}`, owner.id],
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

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'doc.tex', 'FILE', 'application/x-tex', 'TEXT', 'initial-doc-blob') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;

    await fixture.db.query(`INSERT INTO text_documents (file_id, project_id) VALUES ($1, $2)`, [
      fileId,
      projectId,
    ]);
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

  async function createTestSuggestion(oldHash: string, newText: string) {
    const res = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (
         project_id, file_id, author_id, kind, base_revision,
         anchor_json, old_text_hash, new_text, status
       )
       VALUES ($1, $2, $3, 'replace', '1', '{}'::jsonb, $4, $5, 'pending')
       RETURNING id`,
      [projectId, fileId, reviewer.id, oldHash, newText],
    );
    return res.rows[0]!.id;
  }

  it("OWNER/EDITOR accept applies once and modifies document; repeat attempt yields 409", async () => {
    const suggId = await createTestSuggestion("correct-hash-1", "Applied Text A");
    const editorSession = await getSession(editor.email);

    // 1. First accept succeeds
    const res1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: {
        origin,
        cookie: editorSession.cookie,
        "x-csrf-token": editorSession.csrf,
      },
      payload: {
        decision: "accept",
        expectedOldTextHash: "correct-hash-1",
      },
    });

    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    expect(body1.status).toBe("accepted");
    expect(body1.resolvedBy).toBe(editor.id);

    // Verify document was updated
    const nodeCheck = await fixture.db.query<{ blob_key: string }>(
      `SELECT blob_key FROM project_nodes WHERE id = $1`,
      [fileId],
    );
    expect(nodeCheck.rows[0]!.blob_key).toBe(`blob-applied-${suggId}`);

    // 2. Second accept fails with 409 SUGGESTION_CONFLICT
    const res2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: {
        origin,
        cookie: editorSession.cookie,
        "x-csrf-token": editorSession.csrf,
      },
      payload: {
        decision: "accept",
      },
    });

    expect(res2.statusCode).toBe(409);
    expect(res2.json().code).toBe("SUGGESTION_CONFLICT");
  });

  it("rejecting proposal sets status to rejected without altering source text", async () => {
    const suggId = await createTestSuggestion("hash-reject", "Rejected text");
    const ownerSession = await getSession(owner.email);

    const prevBlob = (
      await fixture.db.query<{ blob_key: string }>(
        `SELECT blob_key FROM project_nodes WHERE id = $1`,
        [fileId],
      )
    ).rows[0]!.blob_key;

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
      },
      payload: {
        decision: "reject",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("rejected");

    // Verify source text blob unchanged
    const currBlob = (
      await fixture.db.query<{ blob_key: string }>(
        `SELECT blob_key FROM project_nodes WHERE id = $1`,
        [fileId],
      )
    ).rows[0]!.blob_key;
    expect(currBlob).toBe(prevBlob);
  });

  it("mismatched context hash yields 409 conflict and marks status conflict", async () => {
    const suggId = await createTestSuggestion("expected-hash-x", "Replacement X");
    const ownerSession = await getSession(owner.email);

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
      },
      payload: {
        decision: "accept",
        expectedOldTextHash: "wrong-context-hash", // Mismatch!
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("SUGGESTION_CONFLICT");

    // Suggestion is marked as conflict
    const dbCheck = await fixture.db.query<{ status: string }>(
      `SELECT status FROM suggestions WHERE id = $1`,
      [suggId],
    );
    expect(dbCheck.rows[0]!.status).toBe("conflict");
  });

  it("denies proposal resolution by REVIEWER and VIEWER with 403", async () => {
    const suggId = await createTestSuggestion("h", "test");

    const revSession = await getSession(reviewer.email);
    const resRev = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: {
        origin,
        cookie: revSession.cookie,
        "x-csrf-token": revSession.csrf,
      },
      payload: { decision: "accept" },
    });
    expect(resRev.statusCode).toBe(403);

    const viewSession = await getSession(viewer.email);
    const resView = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: {
        origin,
        cookie: viewSession.cookie,
        "x-csrf-token": viewSession.csrf,
      },
      payload: { decision: "reject" },
    });
    expect(resView.statusCode).toBe(403);
  });

  it("bulk resolution reports per-item result and never labels unapplied text as accepted", async () => {
    const sugg1 = await createTestSuggestion("bulk-h1", "Bulk Text 1");
    const sugg2 = await createTestSuggestion("bulk-h2", "Bulk Text 2");

    const ownerSession = await getSession(owner.email);

    const bulkRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/bulk-resolve`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
      },
      payload: {
        items: [
          { id: sugg1, decision: "accept", expectedOldTextHash: "bulk-h1" }, // Valid
          { id: sugg2, decision: "accept", expectedOldTextHash: "mismatched-h" }, // Conflict
        ],
      },
    });

    expect(bulkRes.statusCode).toBe(200);
    const { results } = bulkRes.json();
    expect(results).toHaveLength(2);

    expect(results[0]).toEqual({
      id: sugg1,
      status: "accepted",
      resolvedBy: owner.id,
    });

    expect(results[1].id).toBe(sugg2);
    expect(results[1].status).toBe("conflict");
    expect(results[1].error).toBeDefined();

    // Verify DB state for sugg2 is indeed conflict and NOT accepted
    const check2 = await fixture.db.query<{ status: string }>(
      `SELECT status FROM suggestions WHERE id = $1`,
      [sugg2],
    );
    expect(check2.rows[0]!.status).toBe("conflict");
  });
});
