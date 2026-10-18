import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("PL-05 S15-T12: Public release approval documentation regression", () => {
  it("verifies public-release-approval.md records verified isolation checklist", async () => {
    const approvalPath = join(process.cwd(), "docs/test-reports/public-release-approval.md");
    const content = await readFile(approvalPath, "utf8");

    expect(content).toContain("Gate 5 Production Sign-Off");
    expect(content).toContain("Isolation primitives audited");
    expect(content).toContain("TeX escape exploits neutralized");
  });
});
