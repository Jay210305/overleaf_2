import { describe, expect, it } from "vitest";
import {
  PolicyViolationError,
  resolveCompilerExecutor,
  validatePublicCompilationPolicy,
} from "../../apps/jobs/src/compilation/public-policy.js";
import { IsolatedCompilerExecutor } from "../../apps/jobs/src/compilation/isolated-executor.js";
import { TrustedWorkerExecutor } from "../../apps/jobs/src/compilation/trusted-worker-executor.js";

describe("S15-T03: Route public mode through verified executor integration", () => {
  it("fails startup when enabling untrusted compile without verified executor", () => {
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        executorType: "unverified",
      }),
    ).toThrowError(PolicyViolationError);

    try {
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        executorType: "unverified",
      });
    } catch (err) {
      expect((err as PolicyViolationError).code).toBe("ISOLATION_REQUIRED");
    }
  });

  it("fails startup when network isolation or shell-escape flags are violated", () => {
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        executorType: "isolated",
        networkDisabled: false,
      }),
    ).toThrowError(/networkDisabled/i);

    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        executorType: "isolated",
        noShellEscape: false,
      }),
    ).toThrowError(/shell escape/i);
  });

  it("enforces audited TeX Live release versions", () => {
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        executorType: "isolated",
        pinnedTeXLiveVersion: "2018-unsupported",
      }),
    ).toThrowError(PolicyViolationError);

    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        executorType: "isolated",
        pinnedTeXLiveVersion: "2024",
      }),
    ).not.toThrow();
  });

  it("resolves IsolatedCompilerExecutor for untrusted jobs when policy is verified", () => {
    const executor = resolveCompilerExecutor(
      {
        untrustedCompileEnabled: true,
        executorType: "isolated",
      },
      true, // isJobUntrusted
    );

    expect(executor).toBeInstanceOf(IsolatedCompilerExecutor);
  });

  it("blocks untrusted job execution when untrusted mode is disabled", () => {
    expect(() =>
      resolveCompilerExecutor(
        {
          untrustedCompileEnabled: false,
        },
        true, // isJobUntrusted
      ),
    ).toThrowError(/untrusted compilation is disabled/i);
  });

  it("resolves TrustedWorkerExecutor for trusted internal jobs", () => {
    const executor = resolveCompilerExecutor(
      {
        untrustedCompileEnabled: false,
      },
      false, // trusted job
    );

    expect(executor).toBeInstanceOf(TrustedWorkerExecutor);
  });
});
