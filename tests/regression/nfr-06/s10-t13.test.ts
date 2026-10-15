import { describe, it, expect } from "vitest";
import {
  verifyManifestAndRevisionMatch,
  type CachedCompilationRecord,
} from "../../../apps/jobs/src/compilation/cache.js";

describe("Regression NFR-06: Generated PDF sourceRevision and manifest hash match exactly", () => {
  const sampleRecord: CachedCompilationRecord = {
    cacheKey: "chk-123",
    projectId: "proj-nfr",
    sourceRevision: 7,
    manifestHash: "sha256-manifest-sample",
    compiler: "xelatex",
    imageDigest: "texlive:2026",
    pdfKey: "artifacts/pdf/doc.pdf",
    logKey: "artifacts/log/doc.log",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  it("passes when both sourceRevision and manifestHash are identical to compilation input", () => {
    expect(verifyManifestAndRevisionMatch(sampleRecord, 7, "sha256-manifest-sample")).toBe(true);
  });

  it("fails verification when sourceRevision differs", () => {
    expect(verifyManifestAndRevisionMatch(sampleRecord, 8, "sha256-manifest-sample")).toBe(false);
    expect(verifyManifestAndRevisionMatch(sampleRecord, 6, "sha256-manifest-sample")).toBe(false);
  });

  it("fails verification when manifestHash differs", () => {
    expect(verifyManifestAndRevisionMatch(sampleRecord, 7, "sha256-manifest-tampered")).toBe(false);
  });
});
