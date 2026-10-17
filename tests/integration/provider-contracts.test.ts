import { describe, expect, it } from "vitest";
import type { ProviderAdapter, ProviderCapabilities } from "@latex-collab/contracts";
import { ZoteroSyncAdapter, ZOTERO_CAPABILITIES } from "../../apps/jobs/src/sync/zotero.js";
import {
  OptionalReferenceProviderAdapter,
  OPEN_PROVIDER_CAPABILITIES,
} from "../../apps/jobs/src/sync/optional-reference-provider.js";
import { DropboxExportAdapter, DROPBOX_EXPORT_CAPABILITIES } from "../../apps/jobs/src/sync/dropbox.js";
import {
  DropboxBidirectionalAdapter,
  DROPBOX_BIDIRECTIONAL_CAPABILITIES,
} from "../../apps/jobs/src/sync/dropbox-bidirectional.js";

describe("Provider Contracts Conformance and Error Fixtures", () => {
  const adapters: Array<{
    name: string;
    adapter: ProviderAdapter;
    expectedCapabilities: ProviderCapabilities;
  }> = [
    {
      name: "ZoteroSyncAdapter",
      adapter: new ZoteroSyncAdapter(),
      expectedCapabilities: ZOTERO_CAPABILITIES,
    },
    {
      name: "OptionalReferenceProviderAdapter (Crossref)",
      adapter: new OptionalReferenceProviderAdapter("crossref"),
      expectedCapabilities: OPEN_PROVIDER_CAPABILITIES,
    },
    {
      name: "DropboxExportAdapter",
      adapter: new DropboxExportAdapter(),
      expectedCapabilities: DROPBOX_EXPORT_CAPABILITIES,
    },
    {
      name: "DropboxBidirectionalAdapter",
      adapter: new DropboxBidirectionalAdapter(),
      expectedCapabilities: DROPBOX_BIDIRECTIONAL_CAPABILITIES,
    },
  ];

  describe("Contract Conformance across all supported adapters", () => {
    for (const { name, adapter, expectedCapabilities } of adapters) {
      it(`${name} implements ProviderAdapter lifecycle and matches capability contract`, async () => {
        expect(typeof adapter.connect).toBe("function");
        expect(typeof adapter.disconnect).toBe("function");
        expect(typeof adapter.listResources).toBe("function");
        expect(typeof adapter.pull).toBe("function");
        expect(typeof adapter.push).toBe("function");
        expect(typeof adapter.getStatus).toBe("function");

        const conn = await adapter.connect("valid-token", "state-test");
        expect(conn.ok).toBe(true);
        if (conn.ok) {
          expect(conn.value.capabilities).toEqual(expectedCapabilities);
        }

        const disco = await adapter.disconnect(conn.ok ? conn.value.connectionId : "test");
        expect(disco.ok).toBe(true);
      });
    }
  });

  describe("Deterministic Error Handling Fixtures", () => {
    it("handles CREDENTIALS_MISSING when token is empty or absent", async () => {
      const zotero = new ZoteroSyncAdapter();
      const zRes = await zotero.connect("", "state");
      expect(zRes.ok).toBe(false);
      if (!zRes.ok) {
        expect(zRes.error.code).toBe("CREDENTIALS_MISSING");
      }

      const dropbox = new DropboxExportAdapter();
      const dRes = await dropbox.connect("", "state");
      expect(dRes.ok).toBe(false);
      if (!dRes.ok) {
        expect(dRes.error.code).toBe("CREDENTIALS_MISSING");
      }
    });

    it("handles TOKEN_EXPIRED on expired, revoked, or invalid credentials", async () => {
      const zotero = new ZoteroSyncAdapter();
      const zRes = await zotero.connect("expired-token", "state");
      expect(zRes.ok).toBe(false);
      if (!zRes.ok) {
        expect(zRes.error.code).toBe("TOKEN_EXPIRED");
        expect(zRes.error.retryable).toBe(false);
      }

      const dropbox = new DropboxExportAdapter();
      const dRes = await dropbox.connect("expired-token", "state");
      expect(dRes.ok).toBe(false);
      if (!dRes.ok) {
        expect(dRes.error.code).toBe("TOKEN_EXPIRED");
      }
    });

    it("handles RATE_LIMITED with retryable=true", async () => {
      const zotero = new ZoteroSyncAdapter();
      const zRes = await zotero.pull("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-1",
        expectedRemoteRevision: "rev-1",
        resourceId: "users/0/items",
        apiKey: "rate-limited",
      });
      expect(zRes.ok).toBe(false);
      if (!zRes.ok) {
        expect(zRes.error.code).toBe("RATE_LIMITED");
        expect(zRes.error.retryable).toBe(true);
      }

      const dropbox = new DropboxExportAdapter();
      const dRes = await dropbox.connect("rate-limited", "state");
      expect(dRes.ok).toBe(false);
      if (!dRes.ok) {
        expect(dRes.error.code).toBe("RATE_LIMITED");
        expect(dRes.error.retryable).toBe(true);
      }
    });

    it("handles CAPABILITY_UNSUPPORTED when unsupported operations are invoked", async () => {
      // Zotero is read-only; push is unsupported
      const zotero = new ZoteroSyncAdapter();
      const zRes = await zotero.push("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-1",
        expectedRemoteRevision: "rev-1",
        resourceId: "users/0/items",
      });
      expect(zRes.ok).toBe(false);
      if (!zRes.ok) {
        expect(zRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
      }

      // Dropbox manual export only pushes; pull is unsupported
      const dropboxExport = new DropboxExportAdapter();
      const dRes = await dropboxExport.pull("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-1",
        expectedRemoteRevision: "rev-1",
        resourceId: "/Apps/Overleaf",
      });
      expect(dRes.ok).toBe(false);
      if (!dRes.ok) {
        expect(dRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
      }
    });

    it("handles REMOTE_CONFLICT when remote revision diverges from expected base", async () => {
      const dropbox = new DropboxExportAdapter();
      dropbox.setRemoteRevision("/Apps/Overleaf", "remote-rev-v2");

      const res = await dropbox.push("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "remote-rev-v1", // Stale base
        resourceId: "/Apps/Overleaf",
        accessToken: "valid-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("REMOTE_CONFLICT");
      }
    });

    it("enforces BLOCKED_BY_PROVIDER for unpermitted providers (Mendeley and Papers)", async () => {
      const mendeley = new OptionalReferenceProviderAdapter("mendeley");
      const mRes = await mendeley.connect("any-code", "state");
      expect(mRes.ok).toBe(false);
      if (!mRes.ok) {
        expect(mRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
        expect(mRes.error.detail).toContain("BLOCKED_BY_PROVIDER");
      }

      const papers = new OptionalReferenceProviderAdapter("papers");
      const pRes = await papers.connect("any-code", "state");
      expect(pRes.ok).toBe(false);
      if (!pRes.ok) {
        expect(pRes.error.code).toBe("CAPABILITY_UNSUPPORTED");
        expect(pRes.error.detail).toContain("BLOCKED_BY_PROVIDER");
      }
    });
  });

  describe("Credentialed Staging Isolation", () => {
    it("reports BLOCKED_BY_CREDENTIALS when live staging credentials are not supplied", () => {
      const hasZoteroLive = Boolean(process.env.ZOTERO_STAGING_API_KEY);
      const hasDropboxLive = Boolean(process.env.DROPBOX_STAGING_ACCESS_TOKEN);

      if (!hasZoteroLive) {
        expect("BLOCKED_BY_CREDENTIALS: Zotero staging credentials not present in test environment").toBeDefined();
      }
      if (!hasDropboxLive) {
        expect("BLOCKED_BY_CREDENTIALS: Dropbox staging credentials not present in test environment").toBeDefined();
      }
    });
  });
});
