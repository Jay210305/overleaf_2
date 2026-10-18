import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("PL-05 S15-T11: Stabilized current-gate release findings regression", () => {
  it("verifies feature-parity-audit provides documented findings across all deliverables", async () => {
    const auditPath = join(process.cwd(), "docs/test-reports/feature-parity-audit.md");
    const content = await readFile(auditPath, "utf8");

    expect(content).toContain("G5 Hardening & Public Candidate Baseline");
    expect(content).toContain("All release criteria for Gate 5 hardening are verified.");
  });
});
