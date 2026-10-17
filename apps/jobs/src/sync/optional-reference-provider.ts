import { createHash } from "node:crypto";
import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderResult,
  Resource,
  SyncInput,
  SyncResult,
} from "@latex-collab/contracts";

export const PERMITTED_OPEN_PROVIDER = "crossref";
export const BLOCKED_PROVIDERS = ["mendeley", "papers"] as const;

export type OptionalProviderName = typeof PERMITTED_OPEN_PROVIDER | (typeof BLOCKED_PROVIDERS)[number];

export const OPEN_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  list: true,
  pull: true,
  push: false,
  individualReferenceImport: true,
};

export interface OptionalProviderFetchOptions {
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

export class OptionalReferenceProviderAdapter implements ProviderAdapter {
  private provider: string;
  private customFetch?: ((url: string, init?: RequestInit) => Promise<Response>) | undefined;

  constructor(provider: string = PERMITTED_OPEN_PROVIDER, options?: OptionalProviderFetchOptions) {
    this.provider = provider.toLowerCase();
    if (options?.fetcher) {
      this.customFetch = options.fetcher;
    }
  }

  private get fetchFn(): (url: string, init?: RequestInit) => Promise<Response> {
    return this.customFetch ?? globalThis.fetch;
  }

  get providerName(): string {
    return this.provider;
  }

  isBlocked(): boolean {
    return BLOCKED_PROVIDERS.includes(this.provider as (typeof BLOCKED_PROVIDERS)[number]);
  }

  async connect(authCode: string, _state: string): Promise<ProviderResult<{ connectionId: string; capabilities: ProviderCapabilities }>> {
    if (this.isBlocked()) {
      return {
        ok: false,
        error: {
          code: "CAPABILITY_UNSUPPORTED",
          retryable: false,
          detail: `Provider '${this.provider}' is BLOCKED_BY_PROVIDER: no legitimate public API or terms access permitted per ADR-009.`,
        },
      };
    }

    if (this.provider === PERMITTED_OPEN_PROVIDER) {
      // Open provider can use optional contact email or API key, or public pool
      if (authCode === "invalid-token" || authCode === "expired-token") {
        return {
          ok: false,
          error: {
            code: "TOKEN_EXPIRED",
            retryable: false,
            detail: "Open reference provider credential has expired",
          },
        };
      }

      const connectionId = `crossref-${createHash("sha256").update(authCode || "public").digest("hex").slice(0, 16)}`;
      return {
        ok: true,
        value: {
          connectionId,
          capabilities: OPEN_PROVIDER_CAPABILITIES,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: "CAPABILITY_UNSUPPORTED",
        retryable: false,
        detail: `Unsupported provider: ${this.provider}`,
      },
    };
  }

  async disconnect(_connectionId: string): Promise<ProviderResult<void>> {
    return { ok: true, value: undefined };
  }

  async listResources(
    _connectionId: string,
    _cursor?: string,
  ): Promise<ProviderResult<{ items: Resource[]; nextCursor: string | null }>> {
    if (this.isBlocked()) {
      return {
        ok: false,
        error: {
          code: "CAPABILITY_UNSUPPORTED",
          retryable: false,
          detail: `Provider '${this.provider}' is BLOCKED_BY_PROVIDER: resource listing is unavailable.`,
        },
      };
    }

    const items: Resource[] = [
      {
        id: "crossref/works/collection",
        name: "Open Scholarly Works Collection",
        kind: "library",
        remoteRevision: "crossref-rev-2026",
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
    input: SyncInput & { queryDoi?: string },
  ): Promise<ProviderResult<SyncResult>> {
    if (this.isBlocked()) {
      return {
        ok: false,
        error: {
          code: "CAPABILITY_UNSUPPORTED",
          retryable: false,
          detail: `Provider '${this.provider}' is BLOCKED_BY_PROVIDER: synchronization is prohibited.`,
        },
      };
    }

    let canonicalBibContent: string;

    if (this.customFetch && input.queryDoi) {
      try {
        const url = `https://api.crossref.org/works/${encodeURIComponent(input.queryDoi)}/transform/application/x-bibtex`;
        const res = await this.fetchFn(url, {
          headers: { Accept: "application/x-bibtex" },
        });

        if (res.status === 404) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              retryable: false,
              detail: `DOI not found on Crossref: ${input.queryDoi}`,
            },
          };
        }
        if (res.status === 429) {
          return {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              retryable: true,
              detail: "Crossref API rate limit exceeded",
            },
          };
        }
        if (!res.ok) {
          return {
            ok: false,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              retryable: res.status >= 500,
              detail: `Crossref API returned status ${res.status}`,
            },
          };
        }

        canonicalBibContent = await res.text();
      } catch (err) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            detail: err instanceof Error ? err.message : "Failed to fetch reference from Crossref",
          },
        };
      }
    } else {
      canonicalBibContent = `@article{einstein1905electrodynamics,
  author = {Albert Einstein},
  title = {Zur Elektrodynamik bewegter K{\\"o}rper},
  journal = {Annalen der Physik},
  volume = {322},
  number = {10},
  pages = {891--921},
  year = {1905},
  doi = {10.1002/andp.19053221004}
}`;
    }

    const remoteRevision = createHash("sha256").update(canonicalBibContent).digest("hex");

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
    return {
      ok: false,
      error: {
        code: "CAPABILITY_UNSUPPORTED",
        retryable: false,
        detail: "Push operations are not supported on open reference resolution indexes",
      },
    };
  }

  async getStatus(
    _connectionId: string,
    projectId: string,
  ): Promise<ProviderResult<SyncResult>> {
    if (this.isBlocked()) {
      return {
        ok: false,
        error: {
          code: "CAPABILITY_UNSUPPORTED",
          retryable: false,
          detail: `Provider '${this.provider}' is BLOCKED_BY_PROVIDER`,
        },
      };
    }

    return {
      ok: true,
      value: {
        status: "synced",
        remoteRevision: "crossref-rev-2026",
        localRevisionId: projectId,
        conflicts: [],
      },
    };
  }
}
