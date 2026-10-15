import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression COL-09 (S09-T04): Suggestions track author, timestamp and status", () => {
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
      [`COL-09 Project ${randomUUID()}`, owner.id],
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

  it("persists suggestion with accurate author, created_at timestamp and pending status", async () => {
    const revSession = await fixture.login(reviewer.email);
    const cookie = String(revSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(revSession.headers["x-csrf-token"]);

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/suggestions`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        fileId,
        kind: "insert",
        baseRevision: "1",
        anchor: { offset: 12 },
        oldTextHash: "hash-old",
        newText: "\\footnote{Important note}",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.authorId).toBe(reviewer.id);
    expect(body.status).toBe("pending");
    expect(body.newText).toBe("\\footnote{Important note}");
    expect(new Date(body.createdAt).getTime()).toBeGreaterThan(0);
  });
});
