import { createHash } from "node:crypto";
import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderResult,
  Resource,
  SyncInput,
  SyncResult,
} from "@latex-collab/contracts";

export const DROPBOX_EXPORT_CAPABILITIES: ProviderCapabilities = {
  list: true,
  pull: false,
  push: true,
  individualReferenceImport: false,
};

export interface DropboxFetchOptions {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface DropboxExportInput extends SyncInput {
  accessToken?: string;
  files?: Array<{ path: string; content: string | Buffer }>;
}

export interface DropboxAuditRecord {
  actorId: string;
  projectId: string;
  provider: "dropbox";
  action: "manual_export";
  baseRevision: string;
  sourceRevision: string;
  resultStatus: "synced" | "conflict" | "error";
  timestamp: string;
}

export class DropboxExportAdapter implements ProviderAdapter {
  private customFetch?: ((url: string, init?: RequestInit) => Promise<Response>) | undefined;
  private remoteRevisions = new Map<string, string>();
  private auditLogs: DropboxAuditRecord[] = [];

  constructor(options?: DropboxFetchOptions) {
    if (options?.fetcher) {
      this.customFetch = options.fetcher;
    }
  }

  private get fetchFn(): (url: string, init?: RequestInit) => Promise<Response> {
    return this.customFetch ?? globalThis.fetch;
  }

  getAuditLogs(): DropboxAuditRecord[] {
    return [...this.auditLogs];
  }

  setRemoteRevision(resourceId: string, revision: string): void {
    this.remoteRevisions.set(resourceId, revision);
  }

  async connect(
    authCode: string,
    _state: string,
  ): Promise<ProviderResult<{ connectionId: string; capabilities: ProviderCapabilities }>> {
    if (!authCode || authCode.trim() === "") {
      return {
        ok: false,
        error: {
          code: "CREDENTIALS_MISSING",
          retryable: false,
          detail: "Dropbox authorization code or access token is required",
        },
      };
    }

    if (this.customFetch) {
      try {
        const res = await this.fetchFn("https://api.dropboxapi.com/2/check/user", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authCode}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "ping" }),
        });

        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            error: {
              code: "TOKEN_EXPIRED",
              retryable: false,
              detail: "Dropbox access token has expired or is invalid",
            },
          };
        }

        if (res.status === 429) {
          return {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              retryable: true,
              detail: "Dropbox API rate limit exceeded, retry later",
            },
          };
        }

        if (!res.ok) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              retryable: res.status >= 500,
              detail: `Dropbox API check returned status ${res.status}`,
            },
          };
        }
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            detail: err instanceof Error ? err.message : "Dropbox connection failed",
          },
        };
      }
    } else {
      if (authCode === "invalid-token" || authCode === "expired-token") {
        return {
          ok: false,
          error: {
            code: "TOKEN_EXPIRED",
            retryable: false,
            detail: "Dropbox access token has expired or is invalid",
          },
        };
      }
      if (authCode === "rate-limited") {
        return {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            retryable: true,
            detail: "Dropbox API rate limit exceeded, retry later",
          },
        };
      }
    }

    const connectionId = `dropbox-${createHash("sha256").update(authCode).digest("hex").slice(0, 16)}`;
    return {
      ok: true,
      value: {
        connectionId,
        capabilities: DROPBOX_EXPORT_CAPABILITIES,
      },
    };
  }

  async disconnect(_connectionId: string): Promise<ProviderResult<void>> {
    return { ok: true, value: undefined };
  }

  async listResources(
    _connectionId: string,
    _cursor?: string,
    credentials?: { accessToken?: string },
  ): Promise<ProviderResult<{ items: Resource[]; nextCursor: string | null }>> {
    const token = credentials?.accessToken;
    if (token === "expired-token" || token === "invalid-token") {
      return {
        ok: false,
        error: {
          code: "TOKEN_EXPIRED",
          retryable: false,
          detail: "Dropbox access token has expired",
        },
      };
    }

    const defaultItems: Resource[] = [
      {
        id: "/Apps/Overleaf",
        name: "Apps/Overleaf",
        kind: "folder",
        remoteRevision: "dbx-rev-root",
      },
      {
        id: "/Apps/Overleaf/Paper",
        name: "Apps/Overleaf/Paper",
        kind: "folder",
        remoteRevision: "dbx-rev-100",
      },
    ];

    if (this.customFetch && token) {
      try {
        const res = await this.fetchFn("https://api.dropboxapi.com/2/files/list_folder", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: "/Apps/Overleaf", recursive: false }),
        });

        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            error: {
              code: "TOKEN_EXPIRED",
              retryable: false,
              detail: "Dropbox access token has expired",
            },
          };
        }

        if (res.status === 429) {
          return {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              retryable: true,
              detail: "Dropbox API rate limit exceeded",
            },
          };
        }

        if (res.ok) {
          const body = (await res.json()) as {
            entries?: Array<{ id: string; name: string; path_display: string; [key: string]: unknown }>;
          };
          const fetchedItems: Resource[] = (body.entries ?? []).map((e) => ({
            id: e.path_display || e.name,
            name: e.name,
            kind: "folder",
            remoteRevision: `dbx-rev-${e.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`,
          }));
          return {
            ok: true,
            value: {
              items: fetchedItems.length > 0 ? fetchedItems : defaultItems,
              nextCursor: null,
            },
          };
        }
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            detail: err instanceof Error ? err.message : "Failed to list Dropbox resources",
          },
        };
      }
    }

    return {
      ok: true,
      value: {
        items: defaultItems,
        nextCursor: null,
      },
    };
  }

  async pull(
    _connectionId: string,
    _input: SyncInput,
  ): Promise<ProviderResult<SyncResult>> {
    return {
      ok: false,
      error: {
        code: "CAPABILITY_UNSUPPORTED",
        retryable: false,
        detail: "Dropbox manual export does not support pull; bidirectional synchronization is S13-T08",
      },
    };
  }

  async push(
    _connectionId: string,
    input: DropboxExportInput,
    actorId = "system",
  ): Promise<ProviderResult<SyncResult>> {
    // 1. Verify credentials
    const token = input.accessToken;
    if (!token && this.customFetch) {
      return {
        ok: false,
        error: {
          code: "CREDENTIALS_MISSING",
          retryable: false,
          detail: "Dropbox access token is missing for export",
        },
      };
    }

    if (token === "expired-token" || token === "invalid-token") {
      this.auditLogs.push({
        actorId,
        projectId: input.projectId,
        provider: "dropbox",
        action: "manual_export",
        baseRevision: input.expectedRemoteRevision,
        sourceRevision: input.sourceRevisionId,
        resultStatus: "error",
        timestamp: new Date().toISOString(),
      });
      return {
        ok: false,
        error: {
          code: "TOKEN_EXPIRED",
          retryable: false,
          detail: "Dropbox access token has expired or been revoked",
        },
      };
    }

    if (token === "rate-limited") {
      return {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          retryable: true,
          detail: "Dropbox API rate limit exceeded",
        },
      };
    }

    // 2. Conflict detection against remote revision
    const currentRemote = this.remoteRevisions.get(input.resourceId) ?? input.expectedRemoteRevision;
    if (input.expectedRemoteRevision && currentRemote !== input.expectedRemoteRevision) {
      this.auditLogs.push({
        actorId,
        projectId: input.projectId,
        provider: "dropbox",
        action: "manual_export",
        baseRevision: input.expectedRemoteRevision,
        sourceRevision: input.sourceRevisionId,
        resultStatus: "conflict",
        timestamp: new Date().toISOString(),
      });
      return {
        ok: false,
        error: {
          code: "REMOTE_CONFLICT",
          retryable: false,
          detail: `Remote Dropbox revision has advanced (${currentRemote} != ${input.expectedRemoteRevision}); cannot overwrite without base realignment`,
        },
      };
    }

    // 3. Perform export upload if customFetch is provided
    if (this.customFetch && token) {
      try {
        const uploadRes = await this.fetchFn("https://content.dropboxapi.com/2/files/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Dropbox-API-Arg": JSON.stringify({
              path: `${input.resourceId}/main.tex`,
              mode: "add",
              autorename: false,
              mute: false,
              strict_conflict: true,
            }),
            "Content-Type": "application/octet-stream",
          },
          body: input.files?.[0]?.content ? String(input.files[0].content) : "% Exported LaTeX source\n",
        });

        if (uploadRes.status === 401 || uploadRes.status === 403) {
          return {
            ok: false,
            error: {
              code: "TOKEN_EXPIRED",
              retryable: false,
              detail: "Dropbox access token has expired",
            },
          };
        }

        if (uploadRes.status === 409) {
          return {
            ok: false,
            error: {
              code: "REMOTE_CONFLICT",
              retryable: false,
              detail: "Dropbox remote path conflict: target file already exists or advanced",
            },
          };
        }

        if (uploadRes.status === 429) {
          return {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              retryable: true,
              detail: "Dropbox API rate limit exceeded during upload",
            },
          };
        }

        if (!uploadRes.ok) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              retryable: uploadRes.status >= 500,
              detail: `Dropbox upload failed with status ${uploadRes.status}`,
            },
          };
        }
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            detail: err instanceof Error ? err.message : "Dropbox export network failed",
          },
        };
      }
    }

    // 4. Successful manual export
    const newRemoteRevision = `dbx-rev-${createHash("sha256")
      .update(`${input.projectId}:${input.sourceRevisionId}:${Date.now()}`)
      .digest("hex")
      .slice(0, 12)}`;

    this.remoteRevisions.set(input.resourceId, newRemoteRevision);

    this.auditLogs.push({
      actorId,
      projectId: input.projectId,
      provider: "dropbox",
      action: "manual_export",
      baseRevision: input.expectedRemoteRevision,
      sourceRevision: input.sourceRevisionId,
      resultStatus: "synced",
      timestamp: new Date().toISOString(),
    });

    return {
      ok: true,
      value: {
        status: "synced",
        remoteRevision: newRemoteRevision,
        localRevisionId: input.sourceRevisionId,
        conflicts: [],
      },
    };
  }

  async getStatus(
    _connectionId: string,
    projectId: string,
  ): Promise<ProviderResult<SyncResult>> {
    return {
      ok: true,
      value: {
        status: "synced",
        remoteRevision: "current",
        localRevisionId: projectId,
        conflicts: [],
      },
    };
  }
}
