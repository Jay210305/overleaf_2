import { describe, expect, it } from "vitest";
import { DropboxBidirectionalAdapter } from "../../../apps/jobs/src/sync/dropbox-bidirectional.js";

describe("INT-07 S13-T08: Bidirectional synchronization conflict and revocation invariants", () => {
  it("enforces explicit conflict for binary files without destructive overwrite", async () => {
    const adapter = new DropboxBidirectionalAdapter();
    adapter.setRemoteState("/Apps/Overleaf/Lab", "remote-v5", [
      {
        path: "diagram.pdf",
        content: Buffer.from("%PDF-1.4 remote binary data"),
        isBinary: true,
      },
    ]);

    const res = await adapter.pull("conn-sync", {
      projectId: "88888888-8888-8888-8888-888888888888",
      sourceRevisionId: "local-v4",
      expectedRemoteRevision: "remote-v4",
      resourceId: "/Apps/Overleaf/Lab",
      accessToken: "token-valid",
      localFiles: [
        {
          path: "diagram.pdf",
          content: Buffer.from("%PDF-1.4 local binary data"),
          isBinary: true,
        },
      ],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe("conflict");
      expect(res.value.conflicts).toEqual([{ path: "diagram.pdf", kind: "binary" }]);
    }
  });

  it("blocks non-fast-forward push and records visible conflict audit event", async () => {
    const adapter = new DropboxBidirectionalAdapter();
    adapter.setRemoteState("/Apps/Overleaf/Lab", "remote-v6");

    const res = await adapter.push("conn-sync", {
      projectId: "88888888-8888-8888-8888-888888888888",
      sourceRevisionId: "local-v4",
      expectedRemoteRevision: "remote-v5", // Stale base
      resourceId: "/Apps/Overleaf/Lab",
      accessToken: "token-valid",
      actorId: "author-alice",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("REMOTE_CONFLICT");
    }

    const audit = adapter.getAuditLogs();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.resultStatus).toBe("conflict");
    expect(audit[0]!.actorId).toBe("author-alice");
  });
});
