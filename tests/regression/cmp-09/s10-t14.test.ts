import { describe, it, expect } from "vitest";
import {
  InMemoryArtifactRetentionManager,
  DEFAULT_RETENTION_POLICY,
} from "../../../apps/jobs/src/maintenance/artifacts.js";

describe("Regression CMP-09: Artifact Retention Cleanup and Source Preservation", () => {
  it("enforces default retention policy of 30 days", () => {
    expect(DEFAULT_RETENTION_POLICY.defaultRetentionDays).toBe(30);
  });

  it("ensures source files remain untouched when expired artifacts are cleaned", () => {
    const manager = new InMemoryArtifactRetentionManager();
    const now = 2000000;

    manager.registerArtifactSet(
      "set-old",
      "project-abc",
      ["storage/artifacts/old.pdf", "storage/artifacts/old.synctex.gz"],
      now - 50000,
    );

    const result = manager.cleanupExpired(now);
    expect(result.deletedSets).toBe(1);
    expect(result.deletedStorageKeys).toBe(2);
    expect(result.preservedSourceFiles).toBe(true);

    expect(manager.hasStorageKey("storage/artifacts/old.pdf")).toBe(false);
  });
});
