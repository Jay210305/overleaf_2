import { describe, it, expect } from "vitest";
import { prepareCleanRebuild } from "../../../apps/jobs/src/compilation/clean.js";
import { CompilationCache } from "../../../apps/jobs/src/compilation/cache.js";

describe("Regression CMP-10: Clean Rebuild Auxiliary Invalidation", () => {
  it("cleans auxiliary files without deleting source or bibliography files", () => {
    const files = [
      "chapters/intro.tex",
      "chapters/intro.aux",
      "main.tex",
      "main.aux",
      "main.bbl",
      "main.blg",
      "main.pdf",
      "refs.bib",
      "figures/graph.pdf",
    ];

    const result = prepareCleanRebuild({
      projectId: "proj-cmp-10",
      forceClean: true,
      existingAuxFiles: files,
    });

    expect(result.removedAuxiliaries).toEqual([
      "chapters/intro.aux",
      "main.aux",
      "main.bbl",
      "main.blg",
    ]);

    expect(result.removedAuxiliaries).not.toContain("chapters/intro.tex");
    expect(result.removedAuxiliaries).not.toContain("main.tex");
    expect(result.removedAuxiliaries).not.toContain("refs.bib");
    // User figure must NOT be treated as auxiliary
    expect(result.removedAuxiliaries).not.toContain("figures/graph.pdf");
  });

  it("invalidates all project entries from compiler cache", () => {
    const cache = new CompilationCache();
    cache.set({
      cacheKey: "k1",
      projectId: "p1",
      sourceRevision: 1,
      manifestHash: "m1",
      compiler: "pdflatex",
      imageDigest: "d1",
      pdfKey: "pdf",
      logKey: "log",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });
    cache.set({
      cacheKey: "k2",
      projectId: "p2",
      sourceRevision: 1,
      manifestHash: "m2",
      compiler: "pdflatex",
      imageDigest: "d1",
      pdfKey: "pdf2",
      logKey: "log2",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });

    const result = prepareCleanRebuild({
      projectId: "p1",
      forceClean: true,
      cache,
    });

    expect(result.invalidatedCacheEntries).toBe(1);
    expect(cache.get("k1", "p1")).toBeNull();
    // Other project untouched
    expect(cache.get("k2", "p2")).not.toBeNull();
  });
});
