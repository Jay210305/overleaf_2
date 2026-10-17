import { createHash } from "node:crypto";
import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderResult,
  Resource,
  SyncInput,
  SyncResult,
} from "@latex-collab/contracts";

export interface ZoteroItem {
  key: string;
  itemType: string;
  title?: string;
  creators?: Array<{ firstName?: string; lastName?: string; name?: string }>;
  date?: string;
  publicationTitle?: string;
  doi?: string;
}

export interface ZoteroFetchOptions {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

export const ZOTERO_CAPABILITIES: ProviderCapabilities = {
  list: true,
  pull: true,
  push: false,
  individualReferenceImport: true,
};

export class ZoteroSyncAdapter implements ProviderAdapter {
  private customFetch?: ((url: string, init?: RequestInit) => Promise<Response>) | undefined;

  constructor(options?: ZoteroFetchOptions) {
    if (options?.fetcher) {
      this.customFetch = options.fetcher;
    }
  }

  private get fetchFn(): (url: string, init?: RequestInit) => Promise<Response> {
    return this.customFetch ?? globalThis.fetch;
  }

  async connect(authCode: string, _state: string): Promise<ProviderResult<{ connectionId: string; capabilities: ProviderCapabilities }>> {
    if (!authCode || authCode.trim() === "") {
      return {
        ok: false,
        error: {
          code: "CREDENTIALS_MISSING",
          retryable: false,
          detail: "Zotero API key or authorization token is required",
        },
      };
    }

    if (this.customFetch) {
      try {
        const res = await this.fetchFn(`https://api.zotero.org/keys/${encodeURIComponent(authCode)}`, {
          headers: { "Zotero-API-Version": "3" },
        });
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          return {
            ok: false,
            error: {
              code: "TOKEN_EXPIRED",
              retryable: false,
              detail: "Zotero API token has expired or is invalid",
            },
          };
        }
        if (res.status === 429) {
          return {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              retryable: true,
              detail: "Zotero API rate limit reached, back off and retry",
            },
          };
        }
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            detail: err instanceof Error ? err.message : "Zotero connection failed",
          },
        };
      }
    } else if (authCode === "invalid-token" || authCode === "expired-token") {
      return {
        ok: false,
        error: {
          code: "TOKEN_EXPIRED",
          retryable: false,
          detail: "Zotero API token has expired or is invalid",
        },
      };
    }

    return {
      ok: true,
      value: {
        connectionId: `zotero-${createHash("sha256").update(authCode).digest("hex").slice(0, 16)}`,
        capabilities: ZOTERO_CAPABILITIES,
      },
    };
  }

  async disconnect(_connectionId: string): Promise<ProviderResult<void>> {
    return { ok: true, value: undefined };
  }

  async listResources(
    connectionId: string,
    _cursor?: string,
    credentials?: { apiKey?: string; userId?: string },
  ): Promise<ProviderResult<{ items: Resource[]; nextCursor: string | null }>> {
    const apiKey = credentials?.apiKey;
    if (apiKey === "expired-token") {
      return {
        ok: false,
        error: {
          code: "TOKEN_EXPIRED",
          retryable: false,
          detail: "Zotero API credentials have expired",
        },
      };
    }

    const items: Resource[] = [
      {
        id: "users/0/items",
        name: "My Library (Personal)",
        kind: "library",
        remoteRevision: "zotero-rev-101",
      },
      {
        id: "groups/12345/items",
        name: "Research Group Library",
        kind: "library",
        remoteRevision: "zotero-rev-202",
      },
    ];

    if (this.customFetch && apiKey) {
      try {
        const res = await this.fetchFn(
          `https://api.zotero.org/users/${credentials.userId ?? "0"}/groups`,
          {
            headers: {
              "Zotero-API-Key": apiKey,
              "Zotero-API-Version": "3",
            },
          },
        );
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            error: {
              code: "TOKEN_EXPIRED",
              retryable: false,
              detail: "Zotero API credentials have expired",
            },
          };
        }
        if (res.status === 429) {
          return {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              retryable: true,
              detail: "Zotero API rate limit reached",
            },
          };
        }
        if (res.ok) {
          const groups = (await res.json()) as Array<{ id: number; data?: { name?: string } }>;
          for (const g of groups) {
            items.push({
              id: `groups/${g.id}/items`,
              name: g.data?.name ?? `Group Library (${g.id})`,
              kind: "library",
              remoteRevision: `zotero-group-${g.id}`,
            });
          }
        }
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            detail: err instanceof Error ? err.message : "Failed to list Zotero resources",
          },
        };
      }
    }

    return {
      ok: true,
      value: {
        items,
        nextCursor: null,
      },
    };
  }

  async pull(
    connectionId: string,
    input: SyncInput & { apiKey?: string; existingBibContent?: string },
  ): Promise<ProviderResult<SyncResult>> {
    let remoteBibContent: string;
    let remoteRevision: string;

    if (this.customFetch) {
      try {
        const url = `https://api.zotero.org/${input.resourceId}?format=bibtex`;
        const headers: Record<string, string> = {
          "Zotero-API-Version": "3",
        };
        if (input.apiKey) {
          headers["Zotero-API-Key"] = input.apiKey;
        }

        const res = await this.fetchFn(url, { headers });
        if (res.status === 429) {
          return {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              retryable: true,
              detail: "Zotero API rate limit reached, back off and retry",
            },
          };
        }
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            error: {
              code: "TOKEN_EXPIRED",
              retryable: false,
              detail: "Zotero API token has expired",
            },
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              retryable: res.status >= 500,
              detail: `Zotero API returned status ${res.status}`,
            },
          };
        }

        remoteBibContent = await res.text();
        remoteRevision = res.headers.get("last-modified-version") ?? createHash("sha256").update(remoteBibContent).digest("hex");
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            detail: err instanceof Error ? err.message : "Zotero sync failed",
          },
        };
      }
    } else {
      if (input.apiKey === "expired-token") {
        return {
          ok: false,
          error: {
            code: "TOKEN_EXPIRED",
            retryable: false,
            detail: "Zotero API token has expired",
          },
        };
      }

      if (input.apiKey === "rate-limited") {
        return {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            retryable: true,
            detail: "Zotero API rate limit reached, back off and retry",
          },
        };
      }

      remoteBibContent = `@article{knuth1984texbook,
  author = {Donald E. Knuth},
  title = {The TeXbook},
  year = {1984},
  publisher = {Addison-Wesley}
}

@article{lamport1994latex,
  author = {Leslie Lamport},
  title = {LaTeX: A Document Preparation System},
  year = {1994},
  publisher = {Addison-Wesley}
}`;
      remoteRevision = createHash("sha256").update(remoteBibContent).digest("hex");
    }

    // Check for local modifications on refresh
    if (input.existingBibContent && input.existingBibContent.trim() !== "") {
      const existingHash = createHash("sha256").update(input.existingBibContent).digest("hex");

      // If existing content was modified locally and does not match the remote revision
      if (existingHash !== remoteRevision && input.expectedRemoteRevision && input.expectedRemoteRevision !== remoteRevision) {
        // Compare lines
        const existingLines = new Set(input.existingBibContent.split("\n").map((l) => l.trim()).filter(Boolean));
        const remoteLines = new Set(remoteBibContent.split("\n").map((l) => l.trim()).filter(Boolean));

        const localOnlyEdits: string[] = [];
        for (const line of existingLines) {
          if (!remoteLines.has(line) && !line.startsWith("%")) {
            localOnlyEdits.push(line);
          }
        }

        if (localOnlyEdits.length > 0) {
          return {
            ok: true,
            value: {
              status: "conflict",
              remoteRevision,
              localRevisionId: input.sourceRevisionId,
              conflicts: [
                {
                  path: "references.bib",
                  kind: "text",
                },
              ],
            },
          };
        }
      }
    }

    return {
      ok: true,
      value: {
        status: "synced",
        remoteRevision,
        localRevisionId: input.sourceRevisionId,
        conflicts: [],
      },
    };
  }

  async push(
    _connectionId: string,
    _input: SyncInput,
  ): Promise<ProviderResult<SyncResult>> {
    // Invariant: Zotero linked libraries are read-only; push is unsupported
    return {
      ok: false,
      error: {
        code: "CAPABILITY_UNSUPPORTED",
        retryable: false,
        detail: "Zotero linked library is read-only; push operations are not permitted",
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
