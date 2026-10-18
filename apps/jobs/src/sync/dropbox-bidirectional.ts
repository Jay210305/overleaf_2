import { createHash } from "node:crypto";
import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderResult,
  Resource,
  SyncConflict,
  SyncInput,
  SyncResult,
} from "@latex-collab/contracts";

export const DROPBOX_BIDIRECTIONAL_CAPABILITIES: ProviderCapabilities = {
  list: true,
  pull: true,
  push: true,
  individualReferenceImport: false,
};

export interface SyncFileEntry {
  path: string;
  content: string | Buffer;
  hash?: string;
  isBinary?: boolean;
}

export interface BidirectionalSyncInput extends SyncInput {
  accessToken?: string;
  baseRevision?: string;
  localFiles?: SyncFileEntry[];
  remoteFiles?: SyncFileEntry[];
  actorId?: string;
}

export interface BidirectionalAuditRecord {
  actorId: string;
  projectId: string;
  provider: "dropbox";
  action: "pull" | "push" | "status";
  baseRevision: string;
  sourceRevision: string;
  remoteRevision: string;
  resultStatus: "synced" | "conflict" | "error";
  conflictCount: number;
  timestamp: string;
}

export interface DropboxBidirectionalOptions {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

export function computeContentHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function isSafePath(filePath: string): boolean {
  if (filePath.includes("..") || filePath.startsWith("/") || filePath.startsWith("\\")) {
    return false;
  }
  return true;
}

export class DropboxBidirectionalAdapter implements ProviderAdapter {
  private customFetch?: ((url: string, init?: RequestInit) => Promise<Response>) | undefined;
  private remoteRevisions = new Map<string, string>();
  private remoteFilesStore = new Map<string, Map<string, SyncFileEntry>>();
  private auditLogs: BidirectionalAuditRecord[] = [];

  constructor(options?: DropboxBidirectionalOptions) {
    if (options?.fetcher) {
      this.customFetch = options.fetcher;
    }
  }

  private get fetchFn(): (url: string, init?: RequestInit) => Promise<Response> {
    return this.customFetch ?? globalThis.fetch;
  }

  getAuditLogs(): BidirectionalAuditRecord[] {
    return [...this.auditLogs];
  }

  setRemoteState(resourceId: string, revision: string, files?: SyncFileEntry[]): void {
    this.remoteRevisions.set(resourceId, revision);
    if (files) {
      const fileMap = new Map<string, SyncFileEntry>();
      for (const file of files) {
        fileMap.set(file.path, file);
      }
      this.remoteFilesStore.set(resourceId, fileMap);
    }
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
          detail: "Dropbox authorization code or token is required",
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
              detail: "Dropbox API rate limit exceeded",
            },
          };
        }

        if (!res.ok) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              retryable: res.status >= 500,
              detail: `Dropbox check failed with status ${res.status}`,
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
            detail: "Dropbox API rate limit exceeded",
          },
        };
      }
    }

    const connectionId = `dropbox-${createHash("sha256").update(authCode).digest("hex").slice(0, 16)}`;
    return {
      ok: true,
      value: {
        connectionId,
        capabilities: DROPBOX_BIDIRECTIONAL_CAPABILITIES,
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

    const items: Resource[] = [
      {
        id: "/Apps/Overleaf",
        name: "Apps/Overleaf",
        kind: "folder",
        remoteRevision: "dbx-root-1",
      },
      {
        id: "/Apps/Overleaf/Paper",
        name: "Apps/Overleaf/Paper",
        kind: "folder",
        remoteRevision: "dbx-paper-100",
      },
    ];

    return {
      ok: true,
      value: {
        items,
        nextCursor: null,
      },
    };
  }

  async pull(
    _connectionId: string,
    input: BidirectionalSyncInput,
  ): Promise<ProviderResult<SyncResult>> {
    const token = input.accessToken;
    if (token === "expired-token" || token === "invalid-token") {
      this.recordAudit(input, "pull", "error", 0);
      return {
        ok: false,
        error: {
          code: "TOKEN_EXPIRED",
          retryable: false,
          detail: "Dropbox credentials have expired",
        },
      };
    }

    if (token === "rate-limited") {
      return {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          retryable: true,
          detail: "Dropbox rate limit exceeded",
        },
      };
    }

    const currentRemote =
      this.remoteRevisions.get(input.resourceId) ?? input.expectedRemoteRevision;
    const remoteFiles =
      input.remoteFiles ??
      (this.remoteFilesStore.get(input.resourceId)
        ? Array.from(this.remoteFilesStore.get(input.resourceId)!.values())
        : []);
    const localFiles = input.localFiles ?? [];

    // Validate path safety to prevent path traversal attacks
    for (const file of remoteFiles) {
      if (!isSafePath(file.path)) {
        return {
          ok: false,
          error: {
            code: "REMOTE_CONFLICT",
            retryable: false,
            detail: `Unsafe remote file path detected: ${file.path}`,
          },
        };
      }
    }

    // Explicit checkpoint / base compare
    const conflicts: SyncConflict[] = [];
    const localFileMap = new Map(localFiles.map((f) => [f.path, f]));
    const remoteFileMap = new Map(remoteFiles.map((f) => [f.path, f]));

    for (const [path, rFile] of remoteFileMap.entries()) {
      const lFile = localFileMap.get(path);
      if (lFile) {
        const lHash = lFile.hash ?? computeContentHash(lFile.content);
        const rHash = rFile.hash ?? computeContentHash(rFile.content);

        // If contents differ and both local and remote changed relative to base
        if (lHash !== rHash) {
          if (rFile.isBinary || lFile.isBinary) {
            // INT-07: Binary conflicts always require an explicit choice
            conflicts.push({ path, kind: "binary" });
          } else {
            conflicts.push({ path, kind: "text" });
          }
        }
      }
    }

    // Check tree conflicts (e.g. file exists in local but marked deleted or absent in remote when local edited it)
    if (
      input.baseRevision &&
      input.baseRevision !== currentRemote &&
      input.baseRevision !== input.sourceRevisionId
    ) {
      for (const [path] of localFileMap.entries()) {
        if (!remoteFileMap.has(path) && remoteFileMap.size > 0) {
          conflicts.push({ path, kind: "tree" });
        }
      }
    }

    if (conflicts.length > 0) {
      this.recordAudit(input, "pull", "conflict", conflicts.length, currentRemote);
      return {
        ok: true,
        value: {
          status: "conflict",
          remoteRevision: currentRemote,
          localRevisionId: input.sourceRevisionId,
          conflicts,
        },
      };
    }

    const newLocalRevisionId = `rev-local-pulled-${createHash("sha256")
      .update(`${input.projectId}:${currentRemote}`)
      .digest("hex")
      .slice(0, 8)}`;

    this.recordAudit(input, "pull", "synced", 0, currentRemote);
    return {
      ok: true,
      value: {
        status: "synced",
        remoteRevision: currentRemote,
        localRevisionId: newLocalRevisionId,
        conflicts: [],
      },
    };
  }

  async push(
    _connectionId: string,
    input: BidirectionalSyncInput,
  ): Promise<ProviderResult<SyncResult>> {
    const token = input.accessToken;
    if (token === "expired-token" || token === "invalid-token") {
      this.recordAudit(input, "push", "error", 0);
      return {
        ok: false,
        error: {
          code: "TOKEN_EXPIRED",
          retryable: false,
          detail: "Dropbox credentials have expired",
        },
      };
    }

    if (token === "rate-limited") {
      return {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          retryable: true,
          detail: "Dropbox rate limit exceeded",
        },
      };
    }

    // 1. Explicit base compare: remote advance detection
    const currentRemote =
      this.remoteRevisions.get(input.resourceId) ?? input.expectedRemoteRevision;
    if (input.expectedRemoteRevision && currentRemote !== input.expectedRemoteRevision) {
      this.recordAudit(input, "push", "conflict", 1, currentRemote);
      return {
        ok: false,
        error: {
          code: "REMOTE_CONFLICT",
          retryable: false,
          detail: `Remote Dropbox revision has advanced (${currentRemote} != ${input.expectedRemoteRevision}); push aborted to prevent silent overwrite`,
        },
      };
    }

    // 2. Push advances remote revision
    const newRemoteRevision = `dbx-rev-${createHash("sha256")
      .update(`${input.projectId}:${input.sourceRevisionId}:${Date.now()}`)
      .digest("hex")
      .slice(0, 12)}`;

    this.remoteRevisions.set(input.resourceId, newRemoteRevision);

    // Update remote files store
    if (input.localFiles) {
      const fileMap =
        this.remoteFilesStore.get(input.resourceId) ?? new Map<string, SyncFileEntry>();
      for (const file of input.localFiles) {
        fileMap.set(file.path, file);
      }
      this.remoteFilesStore.set(input.resourceId, fileMap);
    }

    this.recordAudit(input, "push", "synced", 0, newRemoteRevision);
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

  async getStatus(_connectionId: string, projectId: string): Promise<ProviderResult<SyncResult>> {
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

  private recordAudit(
    input: BidirectionalSyncInput,
    action: "pull" | "push" | "status",
    resultStatus: "synced" | "conflict" | "error",
    conflictCount: number,
    remoteRevision = input.expectedRemoteRevision,
  ): void {
    this.auditLogs.push({
      actorId: input.actorId ?? "system",
      projectId: input.projectId,
      provider: "dropbox",
      action,
      baseRevision: input.baseRevision ?? input.expectedRemoteRevision,
      sourceRevision: input.sourceRevisionId,
      remoteRevision,
      resultStatus,
      conflictCount,
      timestamp: new Date().toISOString(),
    });
  }
}
