import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validatePublicCompilationPolicy, PolicyViolationError } from "../../apps/jobs/src/compilation/public-policy.js";

describe("S15-T12: Approve and enable optional public signup (PL-07, PL-05)", () => {
  it("verifies public-release-approval documents recorded dual-maintainer consensus", async () => {
    const approvalPath = join(process.cwd(), "docs/test-reports/public-release-approval.md");
    const content = await readFile(approvalPath, "utf8");

    expect(content).toContain("Maintainers & Decision Makers:** Julio, Project Co-owner");
    expect(content).toContain("APPROVED (Dual Maintainer Consensus)");
    expect(content).toContain("Co-Maintainer Julio | Project Co-Owner");
  });

  it("permits public untrusted mode only when verified isolation evidence is present", () => {
    // 1. Allowed with verified isolation
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        hasVerifiedIsolation: true,
        networkDisabled: true,
        noShellEscape: true,
      }),
    ).not.toThrow();

    // 2. Blocked without verified isolation
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        hasVerifiedIsolation: false,
        executorType: "unverified",
      }),
    ).toThrow(PolicyViolationError);
  });
});
