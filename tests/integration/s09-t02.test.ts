import { describe, expect, it } from "vitest";
import { myersDiff, compareRevisionManifests, type ManifestItemDiff } from "@latex-collab/latex";
import {
  myersDiff as webMyersDiff,
  compareRevisionManifests as webCompareRevisionManifests,
} from "../../apps/web/src/features/history/diff.js";

describe("S09-T02: Compare text tree and binary revisions", () => {
  describe("Deterministic Myers Diff algorithm", () => {
    it("handles identical text with all equal lines", () => {
      const text = "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}";
      const diff = myersDiff(text, text);

      expect(diff.insertions).toBe(0);
      expect(diff.deletions).toBe(0);
      expect(diff.equal).toBe(4);
      expect(diff.lines.every((l) => l.type === "equal")).toBe(true);
    });

    it("correctly identifies insertions, deletions, and replacements deterministically", () => {
      const oldText = "Line 1\nLine 2\nLine 3\nLine 4";
      const newText = "Line 1\nLine 2 modified\nLine 4\nLine 5";

      const diff = myersDiff(oldText, newText);

      // Line 1: equal
      // Line 2: delete Line 2, insert Line 2 modified
      // Line 3: delete Line 3
      // Line 4: equal
      // Line 5: insert Line 5
      expect(diff.lines.some((l) => l.type === "delete" && l.content === "Line 2")).toBe(true);
      expect(diff.lines.some((l) => l.type === "insert" && l.content === "Line 2 modified")).toBe(
        true,
      );
      expect(diff.lines.some((l) => l.type === "delete" && l.content === "Line 3")).toBe(true);
      expect(diff.lines.some((l) => l.type === "equal" && l.content === "Line 4")).toBe(true);
      expect(diff.lines.some((l) => l.type === "insert" && l.content === "Line 5")).toBe(true);
    });

    it("handles empty texts and edge boundaries", () => {
      const emptyDiff = myersDiff("", "");
      expect(emptyDiff.lines).toHaveLength(0);

      const addedFromEmpty = myersDiff("", "First Line\nSecond Line");
      expect(addedFromEmpty.deletions).toBe(0);
      expect(addedFromEmpty.insertions).toBe(2);

      const deletedToEmpty = myersDiff("First Line\nSecond Line", "");
      expect(deletedToEmpty.insertions).toBe(0);
      expect(deletedToEmpty.deletions).toBe(2);
    });
  });

  describe("Structural tree and binary revision comparison", () => {
    it("identifies file rename by persistent nodeId rather than treating as delete+add", () => {
      const baseItems: ManifestItemDiff[] = [
        {
          nodeId: "node-1",
          path: "old_intro.tex",
          kind: "TEXT",
          sha256: "hash111",
        },
        {
          nodeId: "node-2",
          path: "main.tex",
          kind: "TEXT",
          sha256: "hash222",
        },
      ];

      const targetItems: ManifestItemDiff[] = [
        {
          nodeId: "node-1",
          path: "sections/intro.tex", // renamed and moved!
          kind: "TEXT",
          sha256: "hash111",
        },
        {
          nodeId: "node-2",
          path: "main.tex",
          kind: "TEXT",
          sha256: "hash222",
        },
      ];

      const result = compareRevisionManifests(baseItems, targetItems);

      expect(result.renamed).toHaveLength(1);
      expect(result.renamed[0]).toEqual({
        nodeId: "node-1",
        oldPath: "old_intro.tex",
        newPath: "sections/intro.tex",
        sha256: "hash111",
      });
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(1);
    });

    it("identifies binary file modification strictly by sha256 hash comparison", () => {
      const baseItems: ManifestItemDiff[] = [
        {
          nodeId: "fig-1",
          path: "figures/diagram.png",
          kind: "BINARY",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ];

      const targetItems: ManifestItemDiff[] = [
        {
          nodeId: "fig-1",
          path: "figures/diagram.png",
          kind: "BINARY",
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ];

      const result = compareRevisionManifests(baseItems, targetItems);

      expect(result.modifiedBinary).toHaveLength(1);
      expect(result.modifiedBinary[0]!.oldSha256).toBe(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
      expect(result.modifiedBinary[0]!.newSha256).toBe(
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      );
      expect(result.modifiedText).toHaveLength(0);
    });

    it("identifies newly added and deleted files", () => {
      const baseItems: ManifestItemDiff[] = [
        { nodeId: "node-1", path: "keep.tex", kind: "TEXT", sha256: "h1" },
        { nodeId: "node-2", path: "delete_me.tex", kind: "TEXT", sha256: "h2" },
      ];

      const targetItems: ManifestItemDiff[] = [
        { nodeId: "node-1", path: "keep.tex", kind: "TEXT", sha256: "h1" },
        { nodeId: "node-3", path: "new_file.tex", kind: "TEXT", sha256: "h3" },
      ];

      const result = compareRevisionManifests(baseItems, targetItems);

      expect(result.added).toHaveLength(1);
      expect(result.added[0]!.path).toBe("new_file.tex");

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]!.path).toBe("delete_me.tex");

      expect(result.unchanged).toHaveLength(1);
    });
  });

  describe("Browser-compatible client diff (apps/web/src/features/history/diff.ts)", () => {
    it("mirrors server-side diff results on identical text and modifications", () => {
      const oldText = "Line 1\nLine 2\nLine 3\nLine 4";
      const newText = "Line 1\nLine 2 modified\nLine 4\nLine 5";

      const serverDiff = myersDiff(oldText, newText);
      const clientDiff = webMyersDiff(oldText, newText);

      expect(clientDiff.insertions).toBe(serverDiff.insertions);
      expect(clientDiff.deletions).toBe(serverDiff.deletions);
      expect(clientDiff.equal).toBe(serverDiff.equal);
      expect(clientDiff.lines.some((l) => l.type === "delete" && l.content === "Line 2")).toBe(
        true,
      );
      expect(
        clientDiff.lines.some((l) => l.type === "insert" && l.content === "Line 2 modified"),
      ).toBe(true);
    });

    it("mirrors tree and binary manifest comparison in client", () => {
      const baseItems: ManifestItemDiff[] = [
        { nodeId: "node-1", path: "keep.tex", kind: "TEXT", sha256: "h1" },
        { nodeId: "node-2", path: "delete_me.tex", kind: "TEXT", sha256: "h2" },
      ];

      const targetItems: ManifestItemDiff[] = [
        { nodeId: "node-1", path: "keep.tex", kind: "TEXT", sha256: "h1" },
        { nodeId: "node-3", path: "new_file.tex", kind: "TEXT", sha256: "h3" },
      ];

      const clientResult = webCompareRevisionManifests(baseItems, targetItems);
      expect(clientResult.added).toHaveLength(1);
      expect(clientResult.added[0]!.path).toBe("new_file.tex");
      expect(clientResult.removed).toHaveLength(1);
      expect(clientResult.removed[0]!.path).toBe("delete_me.tex");
      expect(clientResult.unchanged).toHaveLength(1);
    });
  });
});
