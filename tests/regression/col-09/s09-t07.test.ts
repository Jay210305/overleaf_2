import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression COL-09 (S09-T07): Proposal lifecycle and conflict detection", () => {
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
      [`COL-09 Lifecycle ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')`,
      [projectId, reviewer.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'doc.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-1') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("ensures repeated resolution on already accepted suggestion returns 409", async () => {
    const sRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO suggestions (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'delete', '1', '{}', 'h1', '', 'pending') RETURNING id`,
      [projectId, fileId, reviewer.id],
    );
    const suggId = sRes.rows[0]!.id;

    const ownerSession = await fixture.login(owner.email);
    const cookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerSession.headers["x-csrf-token"]);

    // First resolution
    const res1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { decision: "accept" },
    });
    expect(res1.statusCode).toBe(200);

    // Second resolution attempt
    const res2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions/${suggId}/resolve`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { decision: "accept" },
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().code).toBe("SUGGESTION_CONFLICT");
  });
});
