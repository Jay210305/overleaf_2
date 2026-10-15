import { describe, it, expect } from "vitest";
import {
  computeCompilationCacheKey,
  CompilationCache,
  ForeignArtifactAccessDeniedError,
} from "../../../apps/jobs/src/compilation/cache.js";

describe("Regression CMP-11: Compilation Cache Input Hashing and Tenant Isolation", () => {
  it("enforces tenant boundary so cache hits cannot authorize another project's artifacts", () => {
    const cache = new CompilationCache();
    const cacheKey = computeCompilationCacheKey({
      manifestHash: "manifest-1234",
      compiler: "pdflatex",
      imageDigest: "digest-1",
      policyVersion: "v1",
    });

    cache.set({
      cacheKey,
      projectId: "project-A",
      sourceRevision: 10,
      manifestHash: "manifest-1234",
      compiler: "pdflatex",
      imageDigest: "digest-1",
      pdfKey: "storage/project-A/doc.pdf",
      logKey: "storage/project-A/doc.log",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });

    // Access by Project B fails with ForeignArtifactAccessDeniedError
    expect(() => {
      cache.get(cacheKey, "project-B");
    }).toThrow(ForeignArtifactAccessDeniedError);

    // Access by Project A succeeds
    const accessA = cache.get(cacheKey, "project-A");
    expect(accessA).not.toBeNull();
    expect(accessA?.projectId).toBe("project-A");
  });

  it("invalidates all entries of a project when project cache is explicitly invalidated", () => {
    const cache = new CompilationCache();
    cache.set({
      cacheKey: "k1",
      projectId: "proj-inval",
      sourceRevision: 1,
      manifestHash: "m1",
      compiler: "pdflatex",
      imageDigest: "d1",
      pdfKey: "p1",
      logKey: "l1",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });

    const count = cache.invalidateProject("proj-inval");
    expect(count).toBe(1);
    expect(cache.get("k1", "proj-inval")).toBeNull();
  });
});
