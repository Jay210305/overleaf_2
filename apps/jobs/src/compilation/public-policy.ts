import type { CompilerExecutor } from "@latex-collab/contracts";
import { IsolatedCompilerExecutor } from "./isolated-executor.js";
import { TrustedWorkerExecutor } from "./trusted-worker-executor.js";

export interface PublicCompilePolicyConfig {
  untrustedCompileEnabled: boolean;
  executorType?: "isolated" | "trusted-worker" | "unverified" | undefined;
  hasVerifiedIsolation?: boolean | undefined;
  networkDisabled?: boolean | undefined;
  pinnedTeXLiveVersion?: string | undefined;
  noShellEscape?: boolean | undefined;
}

export class PolicyViolationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "PolicyViolationError";
    this.code = code;
  }
}

export const AUDITED_TEXLIVE_VERSIONS = new Set(["2024", "2024.2", "2023"]);

/**
 * Validates public compile policy and environment configurations (S15-T03, PL-07, CMP-01).
 * Enforces startup guard: enabling untrusted mode without verified executor fails startup.
 */
export function validatePublicCompilationPolicy(config: PublicCompilePolicyConfig): void {
  if (config.untrustedCompileEnabled) {
    // 1. Guard against unverified executor
    if (!config.hasVerifiedIsolation && config.executorType !== "isolated") {
      throw new PolicyViolationError(
        "ISOLATION_REQUIRED",
        "Enabling untrusted mode without verified executor fails startup; audited isolation adapter required",
      );
    }

    // 2. Guard network isolation
    if (config.networkDisabled === false) {
      throw new PolicyViolationError(
        "NETWORK_ISOLATION_REQUIRED",
        "Untrusted compilation mode requires networkDisabled: true",
      );
    }

    // 3. Guard -no-shell-escape
    if (config.noShellEscape === false) {
      throw new PolicyViolationError(
        "SHELL_ESCAPE_FORBIDDEN",
        "Untrusted compilation mode strictly forbids shell escape (-no-shell-escape required)",
      );
    }

    // 4. Guard pinned TeX Live version if specified
    if (config.pinnedTeXLiveVersion && !AUDITED_TEXLIVE_VERSIONS.has(config.pinnedTeXLiveVersion)) {
      throw new PolicyViolationError(
        "UNAUDITED_TEXLIVE_VERSION",
        `TeX Live version '${config.pinnedTeXLiveVersion}' has not passed Gate 5 isolation audit`,
      );
    }
  }
}

/**
 * Resolves the appropriate compiler executor based on policy and compilation trust level.
 */
export function resolveCompilerExecutor(
  config: PublicCompilePolicyConfig,
  isJobUntrusted: boolean = false,
): CompilerExecutor {
  validatePublicCompilationPolicy(config);

  if (isJobUntrusted) {
    if (!config.untrustedCompileEnabled) {
      throw new PolicyViolationError(
        "UNTRUSTED_COMPILATION_DISABLED",
        "Untrusted compilation is disabled pending Gate 5 isolation sign-off",
      );
    }
    return new IsolatedCompilerExecutor({
      enforceNetworkIsolation: true,
      defaultTimeoutSeconds: 30,
    });
  }

  // Trusted jobs default to TrustedWorkerExecutor
  return new TrustedWorkerExecutor();
}
