import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression COL-08 (S09-T04): Reviewer cannot modify canonical text directly", () => {
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
      [`COL-08 Project ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')`,
      [projectId, reviewer.id],
    );

    const fRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'main.tex', 'FILE', 'application/x-tex', 'TEXT', 'orig-blob') RETURNING id`,
      [projectId],
    );
    fileId = fRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("denies direct text mutation by REVIEWER with 403 while allowing proposal", async () => {
    const revSession = await fixture.login(reviewer.email);
    const cookie = String(revSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(revSession.headers["x-csrf-token"]);

    // Attempt direct text save via REST (action: EDIT)
    const directRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { content: "Directly overwritten text" },
    });
    expect(directRes.statusCode).toBe(403);

    // Now submit proposal via suggestions endpoint (action: SUGGEST)
    const suggestRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        fileId,
        kind: "replace",
        baseRevision: "1",
        anchor: { start: 0, end: 5 },
        oldTextHash: "hash",
        newText: "Proposed replacement",
      },
    });
    expect(suggestRes.statusCode).toBe(201);
  });
});
