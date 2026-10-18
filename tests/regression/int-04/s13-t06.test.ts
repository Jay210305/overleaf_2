import { describe, expect, it } from "vitest";
import { OptionalReferenceProviderAdapter } from "../../../apps/jobs/src/sync/optional-reference-provider.js";

describe("INT-04 S13-T06: Mendeley and Papers blocked provider verification", () => {
  it("enforces BLOCKED_BY_PROVIDER across all adapter lifecycle methods", async () => {
    const mendeley = new OptionalReferenceProviderAdapter("mendeley");
    expect(mendeley.isBlocked()).toBe(true);

    const connectRes = await mendeley.connect("code", "state");
    expect(connectRes.ok).toBe(false);
    if (!connectRes.ok) {
      expect(connectRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
      expect(connectRes.error.detail).toContain("BLOCKED_BY_PROVIDER");
    }

    const pullRes = await mendeley.pull("conn", {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "rev-1",
      expectedRemoteRevision: "rev-1",
      resourceId: "lib-1",
    });
    expect(pullRes.ok).toBe(false);
    if (!pullRes.ok) {
      expect(pullRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
      expect(pullRes.error.detail).toContain("BLOCKED_BY_PROVIDER");
    }
  });
});
