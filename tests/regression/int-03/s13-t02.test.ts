import { describe, expect, it } from "vitest";
import { ZoteroSyncAdapter, ZOTERO_CAPABILITIES } from "../../../apps/jobs/src/sync/zotero.js";

describe("INT-03 S13-T02: Credentialed Zotero library import and read-only .bib refresh with diff", () => {
  const adapter = new ZoteroSyncAdapter();

  it("verifies capability check: permits list, pull, and reference import; strictly denies push", () => {
    expect(ZOTERO_CAPABILITIES.list).toBe(true);
    expect(ZOTERO_CAPABILITIES.pull).toBe(true);
    expect(ZOTERO_CAPABILITIES.push).toBe(false);
    expect(ZOTERO_CAPABILITIES.individualReferenceImport).toBe(true);
  });

  it("permits initial library import when no local .bib exists", async () => {
    const pullResult = await adapter.pull("conn-active-1", {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "rev-initial",
      expectedRemoteRevision: "",
      resourceId: "users/0/items",
      apiKey: "valid-live-token",
    });

    expect(pullResult.ok).toBe(true);
    if (pullResult.ok) {
      expect(pullResult.value.status).toBe("synced");
      expect(pullResult.value.conflicts).toHaveLength(0);
    }
  });

  it("read-only refresh protects manual edits via line diff comparison and flags conflict", async () => {
    const existingContentWithEdits = `@article{knuth1984texbook,
  author = {Donald E. Knuth},
  title = {The TeXbook (Annotated with personal comments)},
  year = {1984},
  publisher = {Addison-Wesley}
}`;

    const refreshResult = await adapter.pull("conn-active-1", {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "rev-2",
      expectedRemoteRevision: "remote-sha-1234",
      resourceId: "users/0/items",
      apiKey: "valid-live-token",
      existingBibContent: existingContentWithEdits,
    });

    expect(refreshResult.ok).toBe(true);
    if (refreshResult.ok) {
      // Local edits detected: returns conflict rather than silently clobbering manual edits
      expect(refreshResult.value.status).toBe("conflict");
      expect(refreshResult.value.conflicts).toEqual([
        {
          path: "references.bib",
          kind: "text",
        },
      ]);
    }
  });

  it("denies push operation preserving read-only linked boundary", async () => {
    const pushResult = await adapter.push("conn-active-1", {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "rev-2",
      expectedRemoteRevision: "remote-sha",
      resourceId: "users/0/items",
    });

    expect(pushResult.ok).toBe(false);
    if (!pushResult.ok) {
      expect(pushResult.error.code).toBe("CAPABILITY_UNSUPPORTED");
    }
  });
});
