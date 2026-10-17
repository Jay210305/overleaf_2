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

export class OptionalReferenceProviderAdapter implements ProviderAdapter {
  private provider: string;

  constructor(provider: string = PERMITTED_OPEN_PROVIDER) {
    this.provider = provider.toLowerCase();
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

    const canonicalBibContent = `@article{einstein1905electrodynamics,
  author = {Albert Einstein},
  title = {Zur Elektrodynamik bewegter K{\\"o}rper},
  journal = {Annalen der Physik},
  volume = {322},
  number = {10},
  pages = {891--921},
  year = {1905},
  doi = {10.1002/andp.19053221004}
}`;

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
