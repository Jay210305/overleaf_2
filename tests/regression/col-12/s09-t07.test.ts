import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression COL-12 (S09-T07): Concurrent client conflict handling and safe recovery", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editorA: { id: string; email: string };
  let editorB: { id: string; email: string };
  let projectId: string;
  let fileId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editorA = await fixture.seed();
    editorB = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`COL-12 Recovery ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, editorA.id],
    );
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, editorB.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'shared.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-v0') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("handles concurrent conflicting suggestions by safely accepting one and conflicting the other", async () => {
    // Both editors propose conflicting replacements on the same file with the same expected base hash
    const s1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'replace', '1', '{}', 'base-hash', 'Editor A rewrite', 'pending') RETURNING id`,
      [projectId, fileId, editorA.id],
    );
    const sugg1Id = s1.rows[0]!.id;

    const s2 = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'replace', '1', '{}', 'base-hash', 'Editor B conflicting rewrite', 'pending') RETURNING id`,
      [projectId, fileId, editorB.id],
    );
    const sugg2Id = s2.rows[0]!.id;

    const ownerSession = await fixture.login(owner.email);
    const cookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerSession.headers["x-csrf-token"]);

    // Bulk resolve accepts sugg1 but conflicts sugg2 if expected hash differs
    const bulkRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/bulk-resolve`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        items: [
          { id: sugg1Id, decision: "accept", expectedOldTextHash: "base-hash" },
          { id: sugg2Id, decision: "accept", expectedOldTextHash: "different-base-hash" },
        ],
      },
    });

    expect(bulkRes.statusCode).toBe(200);
    const { results } = bulkRes.json();
    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("accepted");
    expect(results[1]!.status).toBe("conflict");

    // Suggestion 2 in DB is marked conflict
    const db2 = await fixture.db.query<{ status: string }>(
      `SELECT status FROM suggestions WHERE id = $1`,
      [sugg2Id],
    );
    expect(db2.rows[0]!.status).toBe("conflict");
  });
});
