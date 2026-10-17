import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyGitImport, type CommentAnchor } from "../../apps/git-bridge/src/import.js";
import { createSessionFixture } from "../helpers/s02-session.js";

describe("S14-T04: Apply Git imports through canonical mutation service", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let project: { id: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status, current_revision)
       VALUES ('Import Test Project', $1, 'pdflatex', 'active', 0)
       RETURNING id`,
      [user.id],
    );
    project = { id: projRes.rows[0]!.id };
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("applies incoming Git file changes as canonical Yjs mutations and creates revision in DB", async () => {
    const changes = [
      {
        path: "main.tex",
        content: "\\documentclass{article}\n\\begin{document}\nImported via Git push.\n\\end{document}\n",
        oldContent: "\\documentclass{article}\n\\begin{document}\nInitial content.\n\\end{document}\n",
      },
      {
        path: "references.bib",
        content: "@article{einstein1905, author={Einstein, A.}, year={1905}}\n",
      },
    ];

    const result = await applyGitImport({
      db: fixture.db,
      projectId: project.id,
      authorUserId: user.id,
      commitSha: "1111222233334444555566667777888899990000",
      commitMessage: "Git push from local terminal",
      changes,
    });

    expect(result.ok).toBe(true);
    expect(result.revisionNo).toBe(1);
    expect(result.appliedFiles).toEqual(["main.tex", "references.bib"]);
    expect(result.yjsDocs.size).toBe(2);
    expect(result.yjsUpdates.size).toBe(2);

    // Verify Y.Doc content matches imported files
    const mainDoc = result.yjsDocs.get("main.tex")!;
    expect(mainDoc.getText("content").toString()).toBe(changes[0]!.content);

    // Verify DB revision record
    const revRow = await fixture.db.query<{
      revision_no: number;
      source: string;
      label: string;
      manifest_hash: string;
    }>(
      `SELECT revision_no, source, label, manifest_hash FROM project_revisions WHERE id = $1`,
      [result.revisionId],
    );
    expect(Number(revRow.rows[0]!.revision_no)).toBe(1);
    expect(revRow.rows[0]!.source).toBe("git");
    expect(revRow.rows[0]!.label).toBe("Git push from local terminal");
    expect(revRow.rows[0]!.manifest_hash).toBe("1111222233334444555566667777888899990000");

    // Verify project current_revision was updated
    const projRow = await fixture.db.query<{ current_revision: number }>(
      `SELECT current_revision FROM projects WHERE id = $1`,
      [project.id],
    );
    expect(Number(projRow.rows[0]!.current_revision)).toBe(1);
  });

  it("detects and reports detached comment anchors when target text is modified or deleted", async () => {
    const existingAnchors: CommentAnchor[] = [
      {
        id: "anchor-1",
        fileId: "file-1",
        filePath: "main.tex",
        startOffset: 0,
        endOffset: 23,
        highlightedText: "\\documentclass{article}", // Still present
      },
      {
        id: "anchor-2",
        fileId: "file-1",
        filePath: "main.tex",
        startOffset: 24,
        endOffset: 50,
        highlightedText: "Old deleted section that no longer exists in git file", // Missing / modified
      },
      {
        id: "anchor-3",
        fileId: "file-2",
        filePath: "deleted-chapter.tex",
        startOffset: 0,
        endOffset: 10,
        highlightedText: "Some text", // Whole file deleted
      },
    ];

    const result = await applyGitImport({
      db: fixture.db,
      projectId: project.id,
      authorUserId: user.id,
      commitSha: "2222333344445555666677778888999900001111",
      commitMessage: "Delete section and chapter",
      changes: [
        {
          path: "main.tex",
          content: "\\documentclass{article}\n\\begin{document}\nNew streamlined content.\n\\end{document}\n",
        },
      ],
      deletedPaths: ["deleted-chapter.tex"],
      existingAnchors,
    });

    expect(result.ok).toBe(true);
    expect(result.detachedAnchors.length).toBe(2);

    const detached2 = result.detachedAnchors.find((a) => a.anchorId === "anchor-2")!;
    expect(detached2).toBeDefined();
    expect(detached2.reason).toBe("text_mismatch");

    const detached3 = result.detachedAnchors.find((a) => a.anchorId === "anchor-3")!;
    expect(detached3).toBeDefined();
    expect(detached3.reason).toBe("file_deleted");
  });
});
