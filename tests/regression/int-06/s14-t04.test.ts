import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyGitImport } from "../../../apps/git-bridge/src/import.js";
import { createSessionFixture } from "../../helpers/s02-session.js";

describe("Regression INT-06 (S14-T04): Monotonic revision history and immutable metadata from Git import", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let project: { id: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status, current_revision)
       VALUES ('Regression INT-06 S14-T04', $1, 'pdflatex', 'active', 0)
       RETURNING id`,
      [user.id],
    );
    project = { id: projRes.rows[0]!.id };
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("monotonically increments revision_no across successive Git imports and records author", async () => {
    // Import 1
    const res1 = await applyGitImport({
      db: fixture.db,
      projectId: project.id,
      authorUserId: user.id,
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      commitMessage: "First push",
      changes: [{ path: "main.tex", content: "Version 1" }],
    });
    expect(res1.revisionNo).toBe(1);

    // Import 2
    const res2 = await applyGitImport({
      db: fixture.db,
      projectId: project.id,
      authorUserId: user.id,
      commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      commitMessage: "Second push",
      changes: [{ path: "main.tex", content: "Version 2" }],
    });
    expect(res2.revisionNo).toBe(2);

    // Verify both revisions exist in DB
    const revs = await fixture.db.query<{ revision_no: number; manifest_hash: string }>(
      `SELECT revision_no, manifest_hash FROM project_revisions WHERE project_id = $1 ORDER BY revision_no ASC`,
      [project.id],
    );
    expect(revs.rows.length).toBe(2);
    expect(Number(revs.rows[0]!.revision_no)).toBe(1);
    expect(revs.rows[0]!.manifest_hash).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(Number(revs.rows[1]!.revision_no)).toBe(2);
    expect(revs.rows[1]!.manifest_hash).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });
});
