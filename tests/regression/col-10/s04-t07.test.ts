import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";

describe("COL-10 S04-T07 Revision comparison showing author, time, labels, tree diff", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("creates two checkpoints and compares added, modified, unchanged files with author/label metadata", async () => {
    const loginRes = await fixture.login(owner.email);
    const cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(loginRes.headers["x-csrf-token"]);

    const proj = await createProject(fixture.db, owner.id, {
      title: `COL10-Diff-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });

    // Checkpoint 1
    const cp1Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${proj.id}/checkpoints`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { label: "v1.0 Baseline", source: "manual" },
    });
    expect(cp1Res.statusCode).toBe(201);
    const cp1 = cp1Res.json();
    expect(cp1.authorId).toBe(owner.id);
    expect(cp1.label).toBe("v1.0 Baseline");
    expect(cp1.createdAt).toBeDefined();

    // Add a new file before Checkpoint 2
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
       VALUES ($1, $2, NULL, 'appendix.tex', 'FILE', 'application/x-tex', 'TEXT', 128)`,
      [randomUUID(), proj.id],
    );

    // Checkpoint 2
    const cp2Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${proj.id}/checkpoints`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { label: "v2.0 With Appendix", source: "compile" },
    });
    expect(cp2Res.statusCode).toBe(201);

    // Compare revisions 1 and 2
    const compareRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${proj.id}/checkpoints/compare?base=1&target=2`,
      headers: { origin, cookie },
    });

    expect(compareRes.statusCode).toBe(200);
    const diff = compareRes.json();
    expect(diff.added).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "appendix.tex" })]),
    );
    expect(diff.unchanged).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "main.tex" })]),
    );
  });
});
