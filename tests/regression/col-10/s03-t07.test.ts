import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";
import { DefaultTextDocumentService } from "../../../apps/api/src/modules/text/text-document-service.js";
import { buildReplacementUpdate } from "../../../apps/jobs/src/sync/apply-changes.js";

describe("COL-10 Regression - Revision history comparison (S03-T07)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let author: { id: string; email: string };
  let repo: RevisionsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    author = await fixture.seed();
    repo = new RevisionsRepository(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("COL-10: compares two immutable revisions identifying added, removed, and modified files", async () => {
    const projectId = randomUUID();
    await fixture.db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'COL10 Project')`,
      [projectId, author.id],
    );

    const file1Id = randomUUID();
    const file2Id = randomUUID();

    // Base state: file1 and file2
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, $2, NULL, 'intro.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob1'),
              ($3, $2, NULL, 'old.tex', 'FILE', 'application/x-tex', 'TEXT', 'blobOld')`,
      [file1Id, projectId, file2Id],
    );
    const text = new DefaultTextDocumentService(fixture.db);
    const replace = async (fileId: string, content: string) => {
      const state = await text.load(projectId, fileId, author.id);
      await text.apply(
        projectId,
        fileId,
        author.id,
        buildReplacementUpdate(state.updateBase64, content)!,
      );
    };
    await replace(file1Id, "intro v1");
    await replace(file2Id, "old file");

    const rev1 = await repo.createStructuralRevision({
      projectId,
      authorId: author.id,
      source: "checkpoint",
      label: "Revision 1",
    });

    // Mutate canonical state: delete old.tex, add conclusion.tex, edit intro.tex.
    await fixture.db.query(`UPDATE project_nodes SET deleted_at = now() WHERE id = $1`, [file2Id]);
    await replace(file1Id, "intro v2");

    const file3Id = randomUUID();
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, $2, NULL, 'conclusion.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob3')`,
      [file3Id, projectId],
    );
    await replace(file3Id, "conclusion");

    const rev2 = await repo.createStructuralRevision({
      projectId,
      authorId: author.id,
      source: "checkpoint",
      label: "Revision 2",
    });

    // Run comparison between rev1 and rev2
    const diff = await repo.compareRevisions(projectId, rev1.revisionNo, rev2.revisionNo);

    expect(diff.added.map((a) => a.path)).toContain("conclusion.tex");
    expect(diff.removed.map((r) => r.path)).toContain("old.tex");
    expect(diff.modified.map((m) => m.path)).toContain("intro.tex");
    expect(diff.unchanged).toHaveLength(0);
  });
});
