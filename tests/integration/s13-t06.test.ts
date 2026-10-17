import { describe, expect, it } from "vitest";
import { ZoteroSyncAdapter } from "../../apps/jobs/src/sync/zotero.js";
import { OptionalReferenceProviderAdapter } from "../../apps/jobs/src/sync/optional-reference-provider.js";
import { DropboxExportAdapter } from "../../apps/jobs/src/sync/dropbox.js";
import { DropboxBidirectionalAdapter } from "../../apps/jobs/src/sync/dropbox-bidirectional.js";

describe("S13-T06: Verify provider contract and real connectivity", () => {
  describe("Real Connectivity Simulation and HTTP Status Mapping", () => {
    it("maps Zotero 401 response to TOKEN_EXPIRED", async () => {
      const adapter = new ZoteroSyncAdapter({
        fetcher: async () =>
          new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
      });

      const res = await adapter.connect("bad-token", "state");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("TOKEN_EXPIRED");
      }
    });

    it("maps Zotero 429 response to RATE_LIMITED with retryable=true", async () => {
      const adapter = new ZoteroSyncAdapter({
        fetcher: async () =>
          new Response(JSON.stringify({ error: "Too Many Requests" }), {
            status: 429,
            headers: { "Retry-After": "5" },
          }),
      });

      const res = await adapter.connect("throttled-key", "state");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("RATE_LIMITED");
        expect(res.error.retryable).toBe(true);
      }
    });

    it("maps Dropbox 409 conflict during file upload to REMOTE_CONFLICT", async () => {
      const adapter = new DropboxExportAdapter({
        fetcher: async () =>
          new Response(JSON.stringify({ error_summary: "path/conflict/folder" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          }),
      });

      const res = await adapter.push("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-1",
        expectedRemoteRevision: "rev-remote-1",
        resourceId: "/Apps/Overleaf",
        accessToken: "token-123",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("REMOTE_CONFLICT");
      }
    });

    it("maps network connectivity failure to PROVIDER_UNAVAILABLE with retryable=true", async () => {
      const adapter = new DropboxBidirectionalAdapter({
        fetcher: async () => {
          throw new Error("ENOTFOUND api.dropboxapi.com");
        },
      });

      const res = await adapter.connect("token", "state");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("PROVIDER_UNAVAILABLE");
        expect(res.error.retryable).toBe(true);
      }
    });
  });

  describe("Provider capability segregation", () => {
    it("distinguishes supported providers from blocked providers without claiming fake DONE", () => {
      const crossref = new OptionalReferenceProviderAdapter("crossref");
      expect(crossref.isBlocked()).toBe(false);

      const mendeley = new OptionalReferenceProviderAdapter("mendeley");
      expect(mendeley.isBlocked()).toBe(true);

      const papers = new OptionalReferenceProviderAdapter("papers");
      expect(papers.isBlocked()).toBe(true);
    });
  });
});
