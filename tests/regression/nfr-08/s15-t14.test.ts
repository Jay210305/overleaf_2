import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("NFR-08 S15-T14: Gate 5 accessibility verification checklist regression", () => {
  it("verifies gate-g5-audit documents WCAG 2.2 AA accessibility validation", async () => {
    const auditPath = join(process.cwd(), "docs/test-reports/gate-g5-audit.md");
    const content = await readFile(auditPath, "utf8");

    expect(content).toContain("WCAG 2.2 AA target: zero serious/critical axe violations");
  });
});
