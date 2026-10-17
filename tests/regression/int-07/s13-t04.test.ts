import { describe, expect, it } from "vitest";
import { DropboxExportAdapter } from "../../../apps/jobs/src/sync/dropbox.js";

describe("INT-07 S13-T04: Authorized Dropbox export revocation and conflict handling", () => {
  it("protects source files from silent overwrite on remote conflict", async () => {
    const adapter = new DropboxExportAdapter();
    adapter.setRemoteRevision("/Apps/Overleaf/Thesis", "rev-200");

    const exportInput = {
      projectId: "77777777-7777-7777-7777-777777777777",
      sourceRevisionId: "rev-local-10",
      expectedRemoteRevision: "rev-100", // Outdated
      resourceId: "/Apps/Overleaf/Thesis",
      accessToken: "dbx-valid-token",
    };

    const res = await adapter.push("conn-dbx-test", exportInput);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("REMOTE_CONFLICT");
      expect(res.error.retryable).toBe(false);
    }
  });

  it("handles token expiration and revocation safely without corrupting local state", async () => {
    const adapter = new DropboxExportAdapter();
    const exportInput = {
      projectId: "77777777-7777-7777-7777-777777777777",
      sourceRevisionId: "rev-local-10",
      expectedRemoteRevision: "rev-100",
      resourceId: "/Apps/Overleaf/Thesis",
      accessToken: "expired-token",
    };

    const res = await adapter.push("conn-dbx-test", exportInput);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("TOKEN_EXPIRED");
    }
  });
});
