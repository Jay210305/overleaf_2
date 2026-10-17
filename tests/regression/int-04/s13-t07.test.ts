import { describe, expect, it } from "vitest";
import {
  OptionalReferenceProviderAdapter,
  BLOCKED_PROVIDERS,
  PERMITTED_OPEN_PROVIDER,
  OPEN_PROVIDER_CAPABILITIES,
} from "../../../apps/jobs/src/sync/optional-reference-provider.js";

describe("INT-04 S13-T07: Permitted provider validation and strict BLOCKED_BY_PROVIDER enforcement", () => {
  it("implements and credential-tests only capabilities validated by ADR-009 provider spike", () => {
    const permitted = new OptionalReferenceProviderAdapter(PERMITTED_OPEN_PROVIDER);
    expect(permitted.isBlocked()).toBe(false);
    expect(OPEN_PROVIDER_CAPABILITIES.list).toBe(true);
    expect(OPEN_PROVIDER_CAPABILITIES.pull).toBe(true);
    expect(OPEN_PROVIDER_CAPABILITIES.push).toBe(false);
  });

  it("leaves unpermitted providers (Mendeley, Papers) blocked with zero claimed parity", async () => {
    for (const provider of BLOCKED_PROVIDERS) {
      const adapter = new OptionalReferenceProviderAdapter(provider);
      expect(adapter.isBlocked()).toBe(true);

      const res = await adapter.connect("token", "state");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("CAPABILITY_UNSUPPORTED");
        expect(res.error.detail).toContain("BLOCKED_BY_PROVIDER");
      }
    }
  });

  it("validates successful sync on permitted open reference index while leaving push disabled", async () => {
    const permitted = new OptionalReferenceProviderAdapter(PERMITTED_OPEN_PROVIDER);
    const syncRes = await permitted.pull("conn-open", {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "rev-1",
      expectedRemoteRevision: "",
      resourceId: "works",
    });

    expect(syncRes.ok).toBe(true);
    if (syncRes.ok) {
      expect(syncRes.value.status).toBe("synced");
      expect(syncRes.value.remoteRevision).toBeDefined();
    }

    const pushRes = await permitted.push("conn-open", {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "rev-1",
      expectedRemoteRevision: "r1",
      resourceId: "works",
    });
    expect(pushRes.ok).toBe(false);
    if (!pushRes.ok) {
      expect(pushRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
    }
  });
});
