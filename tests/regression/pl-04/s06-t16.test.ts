import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PL-04 Release rollback and disaster recovery verification (S06-T16)", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const recoveryDoc = resolve(root, "docs/operations/g1-recovery.md");

  it("verifies release rollback and disaster recovery runbook steps", () => {
    expect(existsSync(recoveryDoc)).toBe(true);
    const content = readFileSync(recoveryDoc, "utf8");

    expect(content).toContain("Rollback & Disaster Recovery Procedure (PL-04)");
    expect(content).toContain("Freeze Traffic");
    expect(content).toContain("Rollback Services");
    expect(content).toContain("Restore Data & Blobs");
    expect(content).toContain("Verify Consistency");
    expect(content).toContain("/api/v1/health/live");
    expect(content).toContain("/api/v1/health/ready");
  });
});
