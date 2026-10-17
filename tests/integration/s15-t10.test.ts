import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("S15-T10: Review accessibility, browsers, and operating docs (NFR-08, NFR-11)", () => {
  it("verifies operational runbooks document disaster recovery, rollback, and healthchecks", async () => {
    const runbookPath = join(process.cwd(), "docs/operations/runbooks.md");
    const content = await readFile(runbookPath, "utf8");

    expect(content).toContain("Disaster Recovery & Automated Restore Walkthrough");
    expect(content).toContain("executeAutomatedRestore");
    expect(content).toContain("Controlled Replica Rollout");
    expect(content).toContain("/api/v1/health/ready");
  });

  it("verifies accessibility and browser compatibility matrix requirements", async () => {
    const e2eSpecPath = join(process.cwd(), "tests/e2e/release-accessibility.spec.ts");
    const specContent = await readFile(e2eSpecPath, "utf8");

    expect(specContent).toContain("wcag22aa");
    expect(specContent).toContain("chromium");
    expect(specContent).toContain("firefox");
  });
});
