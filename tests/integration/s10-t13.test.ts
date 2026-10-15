import { describe, it, expect } from "vitest";
import {
  computeCompilationCacheKey,
  CompilationCache,
  ForeignArtifactAccessDeniedError,
  verifyManifestAndRevisionMatch,
} from "../../apps/jobs/src/compilation/cache.js";

describe("S10-T13: Authorized Content-Aware Compiler Cache", () => {
  const baseInput = {
    manifestHash: "sha256-abc123manifest",
    compiler: "pdflatex",
    imageDigest: "texlive:2026-stable@sha256:fedcba",
    rootFile: "main.tex",
    draft: false,
    policyVersion: "v1",
  };

  it("produces deterministic cache key for identical input", () => {
    const key1 = computeCompilationCacheKey(baseInput);
    const key2 = computeCompilationCacheKey({ ...baseInput });
    expect(key1).toBe(key2);
    expect(typeof key1).toBe("string");
    expect(key1.length).toBe(64); // SHA-256 hex
  });

  it("invalidates key upon any change to manifest, engine, image, options, or policy (CMP-11)", () => {
    const baseKey = computeCompilationCacheKey(baseInput);

    // 1. Manifest change
    const manifestDiffKey = computeCompilationCacheKey({
      ...baseInput,
      manifestHash: "sha256-differentmanifest",
    });
    expect(manifestDiffKey).not.toBe(baseKey);

    // 2. Engine change
    const engineDiffKey = computeCompilationCacheKey({
      ...baseInput,
      compiler: "xelatex",
    });
    expect(engineDiffKey).not.toBe(baseKey);

    // 3. Image digest change
    const imageDiffKey = computeCompilationCacheKey({
      ...baseInput,
      imageDigest: "texlive:2026-patched@sha256:000111",
    });
    expect(imageDiffKey).not.toBe(baseKey);

    // 4. Options change (root file)
    const rootDiffKey = computeCompilationCacheKey({
      ...baseInput,
      rootFile: "chapter1.tex",
    });
    expect(rootDiffKey).not.toBe(baseKey);

    // 5. Options change (draft flag)
    const draftDiffKey = computeCompilationCacheKey({
      ...baseInput,
      draft: true,
    });
    expect(draftDiffKey).not.toBe(baseKey);

    // 6. Policy version change
    const policyDiffKey = computeCompilationCacheKey({
      ...baseInput,
      policyVersion: "v2",
    });
    expect(policyDiffKey).not.toBe(baseKey);
  });

  it("strictly denies cross-tenant access when a foreign project attempts to claim cached artifacts", () => {
    const cache = new CompilationCache();
    const key = computeCompilationCacheKey(baseInput);

    const record = {
      cacheKey: key,
      projectId: "project-authorized-owner",
      sourceRevision: 5,
      manifestHash: baseInput.manifestHash,
      compiler: baseInput.compiler,
      imageDigest: baseInput.imageDigest,
      pdfKey: "artifacts/owner/output.pdf",
      logKey: "artifacts/owner/output.log",
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };
    cache.set(record);

    // Authorized owner gets hit
    const ownerHit = cache.get(key, "project-authorized-owner");
    expect(ownerHit).not.toBeNull();
    expect(ownerHit?.pdfKey).toBe("artifacts/owner/output.pdf");

    // Foreign project is rejected with ForeignArtifactAccessDeniedError
    expect(() => {
      cache.get(key, "project-unauthorized-intruder");
    }).toThrow(ForeignArtifactAccessDeniedError);
  });

  it("verifies exact match of sourceRevision and manifestHash (NFR-06)", () => {
    const record = {
      cacheKey: "some-key",
      projectId: "proj-1",
      sourceRevision: 42,
      manifestHash: "hash-42",
      compiler: "pdflatex",
      imageDigest: "img-1",
      pdfKey: "out.pdf",
      logKey: "out.log",
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    };

    expect(verifyManifestAndRevisionMatch(record, 42, "hash-42")).toBe(true);
    expect(verifyManifestAndRevisionMatch(record, 41, "hash-42")).toBe(false);
    expect(verifyManifestAndRevisionMatch(record, 42, "hash-diff")).toBe(false);
  });

  it("handles cache expiration cleanly", () => {
    const cache = new CompilationCache();
    const key = "expired-key";

    cache.set({
      cacheKey: key,
      projectId: "proj-1",
      sourceRevision: 1,
      manifestHash: "hash-1",
      compiler: "pdflatex",
      imageDigest: "img-1",
      pdfKey: "out.pdf",
      logKey: "out.log",
      createdAt: Date.now() - 5000,
      expiresAt: Date.now() - 100, // already expired
    });

    const hit = cache.get(key, "proj-1");
    expect(hit).toBeNull();
  });
});
