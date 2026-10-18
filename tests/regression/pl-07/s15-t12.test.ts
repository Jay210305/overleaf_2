import { describe, expect, it } from "vitest";
import { validatePublicCompilationPolicy } from "../../../apps/jobs/src/compilation/public-policy.js";

describe("PL-07 S15-T12: Public mode isolation gatekeeper regression", () => {
  it("enforces isolation guard: untrusted compile without verified executor fails startup", () => {
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        hasVerifiedIsolation: false,
      }),
    ).toThrow(/ISOLATION_REQUIRED/);
  });
});
