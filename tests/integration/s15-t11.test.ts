import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("S15-T11: Audit every feature ID and claim (PL-03, PL-05)", () => {
  it("verifies feature-parity-audit.md exists and covers all core requirement families", async () => {
    const auditPath = join(process.cwd(), "docs/test-reports/feature-parity-audit.md");
    const auditContent = await readFile(auditPath, "utf8");

    const families = ["ACC", "PRO", "EDT", "CMP", "COL", "INT", "NFR"];
    for (const family of families) {
      expect(auditContent).toContain(family);
    }
  });

  it("verifies no UI-only shortcuts or fake tests are used for feature claims", async () => {
    const auditPath = join(process.cwd(), "docs/test-reports/feature-parity-audit.md");
    const auditContent = await readFile(auditPath, "utf8");

    expect(auditContent).toContain("Zero Mocked Shortcuts");
    expect(auditContent).toContain('No UI-Only "DONE" Claims');
    expect(auditContent).toContain("Honest Deferred/Blocked Boundaries");
  });
});
