import { describe, expect, it } from "vitest";
import {
  DropboxBidirectionalAdapter,
  DROPBOX_BIDIRECTIONAL_CAPABILITIES,
} from "../../apps/jobs/src/sync/dropbox-bidirectional.js";
import { syncResultSchema } from "@latex-collab/contracts";

describe("S13-T08: Optional bidirectional Dropbox synchronization", () => {
  const adapter = new DropboxBidirectionalAdapter();

  describe("Capabilities and Connection Lifecycle", () => {
    it("reports list, pull, and push capabilities enabled", () => {
      expect(DROPBOX_BIDIRECTIONAL_CAPABILITIES).toEqual({
        list: true,
        pull: true,
        push: true,
        individualReferenceImport: false,
      });
    });

    it("connects successfully with valid credentials", async () => {
      const res = await adapter.connect("sl.u.valid-dropbox-token-bidirectional", "state-sync");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.capabilities.pull).toBe(true);
        expect(res.value.capabilities.push).toBe(true);
      }
    });

    it("rejects connection with CREDENTIALS_MISSING when token is empty", async () => {
      const res = await adapter.connect("", "state-sync");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("CREDENTIALS_MISSING");
      }
    });

    it("rejects connection with TOKEN_EXPIRED when token is expired", async () => {
      const res = await adapter.connect("expired-token", "state-sync");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("TOKEN_EXPIRED");
      }
    });
  });

  describe("Pull Synchronization and Conflict Detection", () => {
    it("fast-forwards pull when remote advances and local has no conflicting edits", async () => {
      const localAdapter = new DropboxBidirectionalAdapter();
      localAdapter.setRemoteState("/Apps/Overleaf/Paper", "dbx-remote-v2", [
        {
          path: "intro.tex",
          content: "\\section{Introduction}\nRemote introduction text.",
        },
      ]);

      const res = await localAdapter.pull("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "dbx-remote-v2",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-token",
        localFiles: [],
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        const validated = syncResultSchema.parse(res.value);
        expect(validated.status).toBe("synced");
        expect(validated.conflicts).toHaveLength(0);
      }
    });

    it("detects text conflict upon simultaneous local and remote edits", async () => {
      const localAdapter = new DropboxBidirectionalAdapter();
      localAdapter.setRemoteState("/Apps/Overleaf/Paper", "dbx-remote-v2", [
        {
          path: "main.tex",
          content: "\\documentclass{article}\n% Edited by remote collaborator",
        },
      ]);

      const res = await localAdapter.pull("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "dbx-remote-v1", // local was based on v1
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-token",
        actorId: "user-sync-test",
        localFiles: [
          {
            path: "main.tex",
            content: "\\documentclass{article}\n% Edited locally by author",
          },
        ],
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        const validated = syncResultSchema.parse(res.value);
        expect(validated.status).toBe("conflict");
        expect(validated.conflicts).toEqual([{ path: "main.tex", kind: "text" }]);
      }

      // Check audit log
      const logs = localAdapter.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.resultStatus).toBe("conflict");
      expect(logs[0]!.conflictCount).toBe(1);
    });

    it("detects binary conflict when binary asset is modified concurrently", async () => {
      const localAdapter = new DropboxBidirectionalAdapter();
      localAdapter.setRemoteState("/Apps/Overleaf/Paper", "dbx-remote-v2", [
        {
          path: "figures/graph.png",
          content: Buffer.from("remote-binary-data-png"),
          isBinary: true,
        },
      ]);

      const res = await localAdapter.pull("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "dbx-remote-v1",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-token",
        localFiles: [
          {
            path: "figures/graph.png",
            content: Buffer.from("local-binary-data-png"),
            isBinary: true,
          },
        ],
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.status).toBe("conflict");
        expect(res.value.conflicts).toEqual([{ path: "figures/graph.png", kind: "binary" }]);
      }
    });

    it("rejects unsafe remote file path with traversal attempt", async () => {
      const localAdapter = new DropboxBidirectionalAdapter();
      const res = await localAdapter.pull("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "dbx-remote-v1",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-token",
        remoteFiles: [
          {
            path: "../../etc/passwd",
            content: "malicious content",
          },
        ],
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("REMOTE_CONFLICT");
        expect(res.error.detail).toContain("Unsafe remote file path");
      }
    });
  });

  describe("Push Synchronization and Remote Conflict Protection", () => {
    it("aborts push with REMOTE_CONFLICT when remote revision has advanced beyond base", async () => {
      const localAdapter = new DropboxBidirectionalAdapter();
      localAdapter.setRemoteState("/Apps/Overleaf/Paper", "dbx-remote-v3");

      const res = await localAdapter.push("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v2",
        expectedRemoteRevision: "dbx-remote-v2", // Remote is now v3
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("REMOTE_CONFLICT");
      }
    });

    it("successfully pushes and updates remote revision when base matches", async () => {
      const localAdapter = new DropboxBidirectionalAdapter();
      localAdapter.setRemoteState("/Apps/Overleaf/Paper", "dbx-remote-v2");

      const res = await localAdapter.push("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v2",
        expectedRemoteRevision: "dbx-remote-v2",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-token",
        localFiles: [
          {
            path: "main.tex",
            content: "\\documentclass{article}\n\\begin{document}\nFinal paper\n\\end{document}",
          },
        ],
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.status).toBe("synced");
        expect(res.value.remoteRevision.startsWith("dbx-rev-")).toBe(true);
        expect(res.value.conflicts).toHaveLength(0);
      }
    });

    it("fails push with TOKEN_EXPIRED when credentials have expired", async () => {
      const res = await adapter.push("conn-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "dbx-remote-v1",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "expired-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("TOKEN_EXPIRED");
      }
    });
  });
});
