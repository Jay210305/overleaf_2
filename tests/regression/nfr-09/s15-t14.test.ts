import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("NFR-09 S15-T14: Gate 5 disaster recovery runbook regression", () => {
  it("verifies public-release runbook documents disaster recovery and rollback procedure", async () => {
    const runbookPath = join(process.cwd(), "docs/operations/public-release.md");
    const content = await readFile(runbookPath, "utf8");

    expect(content).toContain("Production Deployment & Rollback Runbook");
    expect(content).toContain("infra/scripts/backup-restore.ts");
  });
});
