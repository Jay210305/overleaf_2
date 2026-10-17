import { describe, expect, it } from "vitest";
import {
  OptionalReferenceProviderAdapter,
  PERMITTED_OPEN_PROVIDER,
  BLOCKED_PROVIDERS,
  OPEN_PROVIDER_CAPABILITIES,
} from "../../apps/jobs/src/sync/optional-reference-provider.js";

describe("S13-T07: Implement one permitted optional bibliography provider", () => {
  describe("Permitted Open Provider (Crossref)", () => {
    const adapter = new OptionalReferenceProviderAdapter(PERMITTED_OPEN_PROVIDER);

    it("verifies provider capabilities match open reference index contract", () => {
      expect(OPEN_PROVIDER_CAPABILITIES).toEqual({
        list: true,
        pull: true,
        push: false,
        individualReferenceImport: true,
      });
      expect(adapter.isBlocked()).toBe(false);
    });

    it("connects successfully with open or credentialed access", async () => {
      const result = await adapter.connect("mailto:researcher@example.test", "state-xyz");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.connectionId.startsWith("crossref-")).toBe(true);
        expect(result.value.capabilities.pull).toBe(true);
        expect(result.value.capabilities.push).toBe(false);
      }
    });

    it("handles expired credentials with TOKEN_EXPIRED", async () => {
      const result = await adapter.connect("expired-token", "state-xyz");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_EXPIRED");
        expect(result.error.retryable).toBe(false);
      }
    });

    it("lists available scholarly collections", async () => {
      const result = await adapter.listResources("crossref-conn-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items.length).toBeGreaterThanOrEqual(1);
        expect(result.value.items[0]!.kind).toBe("library");
      }
    });

    it("pulls authentic BibTeX references with remote revision hash", async () => {
      const result = await adapter.pull("crossref-conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-1",
        expectedRemoteRevision: "",
        resourceId: "crossref/works/collection",
        queryDoi: "10.1002/andp.19053221004",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("synced");
        expect(result.value.remoteRevision).toBeDefined();
        expect(result.value.conflicts).toHaveLength(0);
      }
    });

    it("denies push on read-only open reference index", async () => {
      const result = await adapter.push("crossref-conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-1",
        expectedRemoteRevision: "r1",
        resourceId: "crossref/works/collection",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CAPABILITY_UNSUPPORTED");
      }
    });
  });

  describe("Enforcement of BLOCKED_BY_PROVIDER on Unpermitted Providers (Mendeley, Papers)", () => {
    it.each(BLOCKED_PROVIDERS)("strictly blocks all operations for %s without fabricated success", async (provider) => {
      const blockedAdapter = new OptionalReferenceProviderAdapter(provider);
      expect(blockedAdapter.isBlocked()).toBe(true);

      // Connect must fail
      const connectRes = await blockedAdapter.connect("some-token", "state");
      expect(connectRes.ok).toBe(false);
      if (!connectRes.ok) {
        expect(connectRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
        expect(connectRes.error.detail).toContain("BLOCKED_BY_PROVIDER");
      }

      // List must fail
      const listRes = await blockedAdapter.listResources("conn-blocked");
      expect(listRes.ok).toBe(false);
      if (!listRes.ok) {
        expect(listRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
        expect(listRes.error.detail).toContain("BLOCKED_BY_PROVIDER");
      }

      // Pull must fail
      const pullRes = await blockedAdapter.pull("conn-blocked", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-1",
        expectedRemoteRevision: "",
        resourceId: "lib-1",
      });
      expect(pullRes.ok).toBe(false);
      if (!pullRes.ok) {
        expect(pullRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
        expect(pullRes.error.detail).toContain("BLOCKED_BY_PROVIDER");
      }
    });
  });
});
