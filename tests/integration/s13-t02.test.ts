import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ZoteroSyncAdapter, ZOTERO_CAPABILITIES } from "../../apps/jobs/src/sync/zotero.js";
import { ZoteroLibraryPanel } from "../../apps/web/src/features/references/zotero.js";

describe("S13-T02: Import and refresh authorized Zotero library", () => {
  const adapter = new ZoteroSyncAdapter();

  describe("Zotero Adapter Capabilities and Lifecycle", () => {
    it("reports read-only pull/list capabilities and disables push", () => {
      expect(ZOTERO_CAPABILITIES).toEqual({
        list: true,
        pull: true,
        push: false,
        individualReferenceImport: true,
      });
    });

    it("connects successfully with valid credentials", async () => {
      const result = await adapter.connect("valid-zotero-api-key-12345", "state-abc");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.connectionId.startsWith("zotero-")).toBe(true);
        expect(result.value.capabilities.pull).toBe(true);
        expect(result.value.capabilities.push).toBe(false);
      }
    });

    it("rejects connection with CREDENTIALS_MISSING when token is empty", async () => {
      const result = await adapter.connect("", "state-abc");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CREDENTIALS_MISSING");
      }
    });

    it("rejects connection with TOKEN_EXPIRED when token is expired or invalid", async () => {
      const result = await adapter.connect("expired-token", "state-abc");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TOKEN_EXPIRED");
      }
    });
  });

  describe("Listing and Pulling Zotero Libraries", () => {
    it("lists available personal and group libraries", async () => {
      const result = await adapter.listResources("conn-123", undefined, {
        apiKey: "valid-key",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.items.length).toBeGreaterThanOrEqual(2);
        expect(result.value.items.some((i) => i.kind === "library")).toBe(true);
      }
    });

    it("pulls library references formatted as BibTeX with remote revision hash", async () => {
      const result = await adapter.pull("conn-123", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-1",
        expectedRemoteRevision: "",
        resourceId: "users/0/items",
        apiKey: "valid-key",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("synced");
        expect(result.value.remoteRevision).toBeDefined();
        expect(result.value.conflicts).toHaveLength(0);
      }
    });

    it("handles rate-limiting upstream safely with retryable flag", async () => {
      const result = await adapter.pull("conn-123", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-1",
        expectedRemoteRevision: "",
        resourceId: "users/0/items",
        apiKey: "rate-limited",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("RATE_LIMITED");
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe("Read-only linked .bib refresh and conflict protection", () => {
    it("detects conflict and protects local edits when remote has changed and local .bib has manual edits", async () => {
      // Local .bib contains a custom entry added manually
      const localCustomBib = `@article{knuth1984texbook,
  author = {Donald E. Knuth},
  title = {The TeXbook},
  year = {1984},
  publisher = {Addison-Wesley}
}

@article{my_custom_local_entry,
  author = {Local Author},
  title = {Unsynced Local Modification},
  year = {2026}
}`;

      const result = await adapter.pull("conn-123", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-1",
        expectedRemoteRevision: "old-remote-sha-different",
        resourceId: "users/0/items",
        apiKey: "valid-key",
        existingBibContent: localCustomBib,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("conflict");
        expect(result.value.conflicts.length).toBeGreaterThan(0);
        expect(result.value.conflicts[0]!.path).toBe("references.bib");
      }
    });

    it("strictly forbids push on read-only Zotero linked libraries", async () => {
      const result = await adapter.push("conn-123", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-1",
        expectedRemoteRevision: "rev-1",
        resourceId: "users/0/items",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CAPABILITY_UNSUPPORTED");
        expect(result.error.detail).toContain("read-only");
      }
    });
  });

  describe("ZoteroLibraryPanel UI rendering and authorization", () => {
    it("renders disconnected prompt when account is not connected", () => {
      const html = renderToString(
        React.createElement(ZoteroLibraryPanel, {
          projectId: "123e4567-e89b-12d3-a456-426614174000",
          userRole: "OWNER",
          connected: false,
        }),
      );

      expect(html).toContain("Zotero account is not connected");
      expect(html).toContain("Read-only Linked .bib");
    });

    it("renders library selector and link button for EDITOR when connected", () => {
      const html = renderToString(
        React.createElement(ZoteroLibraryPanel, {
          projectId: "123e4567-e89b-12d3-a456-426614174000",
          userRole: "EDITOR",
          connected: true,
          libraries: [
            {
              id: "users/0/items",
              name: "My Library",
              kind: "library",
              remoteRevision: "r1",
            },
          ],
        }),
      );

      expect(html).toContain("My Library");
      expect(html).toContain("Link Library as .bib");
    });

    it("disables link and refresh buttons for VIEWER with viewing-only notice", () => {
      const html = renderToString(
        React.createElement(ZoteroLibraryPanel, {
          projectId: "123e4567-e89b-12d3-a456-426614174000",
          userRole: "VIEWER",
          connected: true,
          libraries: [
            {
              id: "users/0/items",
              name: "My Library",
              kind: "library",
              remoteRevision: "r1",
            },
          ],
        }),
      );

      expect(html).toContain("Viewing only");
      expect(html).toContain("disabled");
    });
  });
});
