import { describe, expect, it } from "vitest";
import { validatePublicCompilationPolicy } from "../../../apps/jobs/src/compilation/public-policy.js";

describe("PL-07 S15-T08: Compiler trust boundary and secret protection regression", () => {
  it("strictly enforces compiler trust boundary when untrusted compilation is enabled", () => {
    // Missing verified isolation
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        hasVerifiedIsolation: false,
      }),
    ).toThrow(/ISOLATION_REQUIRED/);

    // Unaudited TeX Live version
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        hasVerifiedIsolation: true,
        pinnedTeXLiveVersion: "2018-unsupported",
      }),
    ).toThrow(/UNAUDITED_TEXLIVE_VERSION/);
  });
});
