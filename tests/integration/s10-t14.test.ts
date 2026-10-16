import { describe, it, expect } from "vitest";
import {
  prepareCleanRebuild,
  isAuxiliaryFile,
  compareBuildOutputs,
  AUXILIARY_EXTENSIONS,
} from "../../apps/jobs/src/compilation/clean.js";
import { CompilationCache } from "../../apps/jobs/src/compilation/cache.js";
import { InMemoryArtifactRetentionManager } from "../../apps/jobs/src/maintenance/artifacts.js";

describe("S10-T14: Clean Rebuild and Retention Cleanup", () => {
  it("identifies all standard LaTeX auxiliary and intermediate extensions", () => {
    for (const ext of [".aux", ".bbl", ".blg", ".log", ".out", ".synctex.gz", ".toc"]) {
      expect(AUXILIARY_EXTENSIONS).toContain(ext);
      expect(isAuxiliaryFile(`document${ext}`)).toBe(true);
    }

    // Source files must NOT be auxiliary
    expect(isAuxiliaryFile("main.tex")).toBe(false);
    expect(isAuxiliaryFile("references.bib")).toBe(false);
    expect(isAuxiliaryFile("figure.png")).toBe(false);
  });

  it("invalidates cache and purges auxiliary files on forceClean (CMP-10)", () => {
    const cache = new CompilationCache();
    const projectId = "proj-clean-1";

    cache.set({
      cacheKey: "k1",
      projectId,
      sourceRevision: 1,
      manifestHash: "m1",
      compiler: "pdflatex",
      imageDigest: "d1",
      pdfKey: "pdf-1",
      logKey: "log-1",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });

    const existingFiles = [
      "main.tex",
      "main.aux",
      "main.log",
      "main.bbl",
      "main.synctex.gz",
      "figure.png",
    ];

    const result = prepareCleanRebuild({
      projectId,
      forceClean: true,
      cache,
      existingAuxFiles: existingFiles,
    });

    expect(result.cleaned).toBe(true);
    expect(result.invalidatedCacheEntries).toBe(1);
    expect(result.removedAuxiliaries).toEqual([
      "main.aux",
      "main.log",
      "main.bbl",
      "main.synctex.gz",
    ]);

    // Source files preserved
    expect(result.removedAuxiliaries).not.toContain("main.tex");
    expect(result.removedAuxiliaries).not.toContain("figure.png");
  });

  it("does not clear cache or auxiliaries when forceClean is false", () => {
    const cache = new CompilationCache();
    const result = prepareCleanRebuild({
      projectId: "proj-1",
      forceClean: false,
      cache,
      existingAuxFiles: ["main.aux"],
    });

    expect(result.cleaned).toBe(false);
    expect(result.invalidatedCacheEntries).toBe(0);
    expect(result.removedAuxiliaries).toEqual([]);
  });

  it("verifies fixture comparison determinism", () => {
    const output1 = new Uint8Array([1, 2, 3, 4, 5]);
    const output2 = new Uint8Array([1, 2, 3, 4, 5]);
    const output3 = new Uint8Array([1, 2, 3, 4, 99]);

    const compSame = compareBuildOutputs(output1, output2);
    expect(compSame.identical).toBe(true);
    expect(compSame.byteLengthDiff).toBe(0);

    const compDiff = compareBuildOutputs(output1, output3);
    expect(compDiff.identical).toBe(false);
  });

  it("idempotently cleans up expired compilation artifacts while preserving source (CMP-09)", () => {
    const manager = new InMemoryArtifactRetentionManager();
    const now = 1000000;

    // Active (unexpired) set
    manager.registerArtifactSet("set-active", "proj-1", ["storage/pdf/active.pdf"], now + 10000);

    // Expired set
    manager.registerArtifactSet(
      "set-expired",
      "proj-1",
      ["storage/pdf/expired.pdf", "storage/log/expired.log"],
      now - 1000,
    );

    // Run cleanup
    const run1 = manager.cleanupExpired(now);
    expect(run1.scanned).toBe(2);
    expect(run1.deletedSets).toBe(1);
    expect(run1.deletedStorageKeys).toBe(2);
    expect(run1.preservedSourceFiles).toBe(true);

    // Expired keys gone from storage
    expect(manager.hasStorageKey("storage/pdf/expired.pdf")).toBe(false);
    expect(manager.hasStorageKey("storage/log/expired.log")).toBe(false);

    // Active set preserved
    expect(manager.hasStorageKey("storage/pdf/active.pdf")).toBe(true);
    expect(manager.getArtifactSet("set-active")).toBeDefined();

    // Idempotent: re-running deletes 0
    const run2 = manager.cleanupExpired(now);
    expect(run2.deletedSets).toBe(0);
    expect(run2.deletedStorageKeys).toBe(0);
  });
});
