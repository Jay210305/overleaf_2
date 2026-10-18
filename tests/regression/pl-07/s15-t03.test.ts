import { describe, expect, it } from "vitest";
import {
  PolicyViolationError,
  resolveCompilerExecutor,
  validatePublicCompilationPolicy,
} from "../../../apps/jobs/src/compilation/public-policy.js";

describe("PL-07 S15-T03: Public compiler trust boundary and policy enforcement regression", () => {
  it("strictly prohibits bypassing the compiler trust boundary with empty or unverified configuration", () => {
    // Attempting untrusted compilation with no verified executor
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
      }),
    ).toThrowError(PolicyViolationError);

    // Attempting untrusted compilation with unverified executor
    expect(() =>
      resolveCompilerExecutor(
        {
          untrustedCompileEnabled: true,
          executorType: "unverified",
        },
        true,
      ),
    ).toThrowError(/ISOLATION_REQUIRED/);
  });

  it("ensures public mode is blocked when capability is not enabled", () => {
    expect(() =>
      resolveCompilerExecutor(
        {
          untrustedCompileEnabled: false,
        },
        true, // untrusted job
      ),
    ).toThrowError(/UNTRUSTED_COMPILATION_DISABLED/);
  });
});
