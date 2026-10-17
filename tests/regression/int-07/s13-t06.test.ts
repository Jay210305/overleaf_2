import { describe, expect, it } from "vitest";
import { DropboxExportAdapter } from "../../../apps/jobs/src/sync/dropbox.js";
import { DropboxBidirectionalAdapter } from "../../../apps/jobs/src/sync/dropbox-bidirectional.js";

describe("INT-07 S13-T06: Dropbox error classification and remote conflict validation", () => {
  it("classifies remote advancement as non-retryable REMOTE_CONFLICT across both Dropbox adapters", async () => {
    const exportAdapter = new DropboxExportAdapter();
    exportAdapter.setRemoteRevision("/folder", "remote-v2");

    const exportRes = await exportAdapter.push("conn", {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "local-v1",
      expectedRemoteRevision: "remote-v1",
      resourceId: "/folder",
      accessToken: "token",
    });
    expect(exportRes.ok).toBe(false);
    if (!exportRes.ok) {
      expect(exportRes.error.code).toBe("REMOTE_CONFLICT");
      expect(exportRes.error.retryable).toBe(false);
    }

    const biAdapter = new DropboxBidirectionalAdapter();
    biAdapter.setRemoteState("/folder", "remote-v2");

    const biRes = await biAdapter.push("conn", {
      projectId: "123e4567-e89b-12d3-a456-426614174000",
      sourceRevisionId: "local-v1",
      expectedRemoteRevision: "remote-v1",
      resourceId: "/folder",
      accessToken: "token",
    });
    expect(biRes.ok).toBe(false);
    if (!biRes.ok) {
      expect(biRes.error.code).toBe("REMOTE_CONFLICT");
      expect(biRes.error.retryable).toBe(false);
    }
  });
});
