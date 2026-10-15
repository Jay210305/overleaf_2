import { describe, expect, it } from "vitest";
import { myersDiff, compareRevisionManifests } from "@latex-collab/latex";

describe("Regression COL-10 (S09-T02): Text, tree and binary comparison", () => {
  it("enforces deterministic Myers diff results under identical inputs", () => {
    const docA = "\\section{Intro}\nInitial paragraph here.\n\\subsection{Background}";
    const docB = "\\section{Introduction}\nInitial paragraph here.\n\\subsection{Background}\nExtra details.";

    const run1 = myersDiff(docA, docB);
    const run2 = myersDiff(docA, docB);

    expect(run1).toEqual(run2);
    expect(run1.insertions).toBe(2);
    expect(run1.deletions).toBe(1);
  });

  it("differentiates structural changes by node ID and content changes by hash", () => {
    const diff = compareRevisionManifests(
      [
        { nodeId: "node-x", path: "doc.tex", kind: "TEXT", sha256: "hash-old" },
        { nodeId: "node-img", path: "photo.jpg", kind: "BINARY", sha256: "bin-old" },
      ],
      [
        { nodeId: "node-x", path: "renamed_doc.tex", kind: "TEXT", sha256: "hash-new" },
        { nodeId: "node-img", path: "photo.jpg", kind: "BINARY", sha256: "bin-new" },
      ],
    );

    expect(diff.renamed).toHaveLength(1);
    expect(diff.renamed[0]!.nodeId).toBe("node-x");
    expect(diff.modifiedText).toHaveLength(1);
    expect(diff.modifiedBinary).toHaveLength(1);
    expect(diff.modifiedBinary[0]!.oldSha256).toBe("bin-old");
    expect(diff.modifiedBinary[0]!.newSha256).toBe("bin-new");
  });
});
