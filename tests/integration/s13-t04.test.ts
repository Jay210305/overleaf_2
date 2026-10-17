import { describe, expect, it } from "vitest";
import {
  DropboxExportAdapter,
  DROPBOX_EXPORT_CAPABILITIES,
} from "../../apps/jobs/src/sync/dropbox.js";
import { syncInputSchema, syncResultSchema } from "@latex-collab/contracts";

describe("S13-T04: Authorized manual Dropbox export", () => {
  const adapter = new DropboxExportAdapter();

  describe("Capabilities and Connection Lifecycle", () => {
    it("reports push and list capabilities but disallows pull and individual reference import", () => {
      expect(DROPBOX_EXPORT_CAPABILITIES).toEqual({
        list: true,
        pull: false,
        push: true,
        individualReferenceImport: false,
      });
    });

    it("connects with valid Dropbox authorization token", async () => {
      const res = await adapter.connect("sl.u.valid-dropbox-token-12345", "state-xyz");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.connectionId.startsWith("dropbox-")).toBe(true);
        expect(res.value.capabilities.push).toBe(true);
        expect(res.value.capabilities.pull).toBe(false);
      }
    });

    it("rejects connection with CREDENTIALS_MISSING when token is empty", async () => {
      const res = await adapter.connect("", "state-xyz");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("CREDENTIALS_MISSING");
      }
    });

    it("rejects connection with TOKEN_EXPIRED when token is expired", async () => {
      const res = await adapter.connect("expired-token", "state-xyz");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("TOKEN_EXPIRED");
      }
    });

    it("rejects connection with RATE_LIMITED when provider throttles", async () => {
      const res = await adapter.connect("rate-limited", "state-xyz");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("RATE_LIMITED");
        expect(res.error.retryable).toBe(true);
      }
    });

    it("lists remote destination folders", async () => {
      const res = await adapter.listResources("conn-dropbox-1", undefined, {
        accessToken: "valid-token",
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.items.length).toBeGreaterThan(0);
        expect(res.value.items[0]!.kind).toBe("folder");
      }
    });

    it("fails pull operation with CAPABILITY_UNSUPPORTED", async () => {
      const input = syncInputSchema.parse({
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-1",
        expectedRemoteRevision: "rev-remote-1",
        resourceId: "/Apps/Overleaf/Paper",
      });
      const res = await adapter.pull("conn-dropbox-1", input);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("CAPABILITY_UNSUPPORTED");
        expect(res.error.retryable).toBe(false);
      }
    });
  });

  describe("Manual Export Push and Conflict Protection", () => {
    it("publishes frozen authorized source and generates new remote revision", async () => {
      const localAdapter = new DropboxExportAdapter();
      const input = {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "dbx-rev-base",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-dropbox-token",
        files: [
          {
            path: "main.tex",
            content: "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}",
          },
        ],
      };

      const res = await localAdapter.push("conn-dropbox-1", input, "user-author-1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        const validated = syncResultSchema.parse(res.value);
        expect(validated.status).toBe("synced");
        expect(validated.localRevisionId).toBe("rev-local-v1");
        expect(validated.remoteRevision.startsWith("dbx-rev-")).toBe(true);
        expect(validated.conflicts).toEqual([]);
      }

      // Check audit log
      const logs = localAdapter.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]!.action).toBe("manual_export");
      expect(logs[0]!.resultStatus).toBe("synced");
      expect(logs[0]!.actorId).toBe("user-author-1");
    });

    it("detects remote conflict when remote has advanced beyond expected base", async () => {
      const localAdapter = new DropboxExportAdapter();
      // Simulate remote having advanced to rev-remote-v2
      localAdapter.setRemoteRevision("/Apps/Overleaf/Paper", "rev-remote-v2");

      const input = {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "rev-remote-v1", // Outdated base
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-dropbox-token",
      };

      const res = await localAdapter.push("conn-dropbox-1", input, "user-author-1");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("REMOTE_CONFLICT");
        expect(res.error.retryable).toBe(false);
      }

      // Audit logs conflict attempt
      const logs = localAdapter.getAuditLogs();
      expect(logs.some((l) => l.resultStatus === "conflict")).toBe(true);
    });

    it("rejects export with TOKEN_EXPIRED when credentials have expired", async () => {
      const input = {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "rev-remote-v1",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "expired-token",
      };

      const res = await adapter.push("conn-dropbox-1", input);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("TOKEN_EXPIRED");
      }
    });

    it("rejects export with CREDENTIALS_MISSING when token is absent in custom fetcher mode", async () => {
      const httpAdapter = new DropboxExportAdapter({
        fetcher: async () => new Response("ok", { status: 200 }),
      });
      const input = {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "rev-remote-v1",
        resourceId: "/Apps/Overleaf/Paper",
      };

      const res = await httpAdapter.push("conn-dropbox-1", input);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("CREDENTIALS_MISSING");
      }
    });
  });

  describe("HTTP Fetcher Integration", () => {
    it("handles remote 409 conflict from Dropbox API", async () => {
      const httpAdapter = new DropboxExportAdapter({
        fetcher: async (url) => {
          if (url.includes("/files/upload")) {
            return new Response(JSON.stringify({ error_summary: "path/conflict/file" }), {
              status: 409,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response("ok", { status: 200 });
        },
      });

      const res = await httpAdapter.push("conn-dropbox-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "rev-remote-v1",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "valid-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("REMOTE_CONFLICT");
      }
    });

    it("handles remote 401 token expiry from Dropbox API", async () => {
      const httpAdapter = new DropboxExportAdapter({
        fetcher: async () =>
          new Response(JSON.stringify({ error_summary: "invalid_access_token" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
      });

      const res = await httpAdapter.push("conn-dropbox-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "rev-remote-v1",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "revoked-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("TOKEN_EXPIRED");
      }
    });

    it("handles remote 429 rate limit from Dropbox API", async () => {
      const httpAdapter = new DropboxExportAdapter({
        fetcher: async () =>
          new Response(JSON.stringify({ error_summary: "too_many_requests" }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          }),
      });

      const res = await httpAdapter.push("conn-dropbox-1", {
        projectId: "123e4567-e89b-12d3-a456-426614174000",
        sourceRevisionId: "rev-local-v1",
        expectedRemoteRevision: "rev-remote-v1",
        resourceId: "/Apps/Overleaf/Paper",
        accessToken: "throttled-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("RATE_LIMITED");
        expect(res.error.retryable).toBe(true);
      }
    });
  });
});
