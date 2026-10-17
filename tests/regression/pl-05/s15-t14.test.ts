import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("PL-05 S15-T14: Gate 5 release evidence stabilization regression", () => {
  it("verifies gate-g5-audit documents complete passing release candidate", async () => {
    const auditPath = join(process.cwd(), "docs/test-reports/gate-g5-audit.md");
    const content = await readFile(auditPath, "utf8");

    expect(content).toContain("Gate 5 (G5) Public Hardening & Production Release Audit");
    expect(content).toContain("Status:** PASS");
  });
});
