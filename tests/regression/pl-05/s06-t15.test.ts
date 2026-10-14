import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PL-05 Walking skeleton and stabilized G1 release findings (S06-T15)", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const deployDoc = resolve(root, "docs/test-reports/g1-deploy.md");

  it("verifies G1 deployment smoke test report exists with documented findings and PASS status", () => {
    expect(existsSync(deployDoc)).toBe(true);
    const content = readFileSync(deployDoc, "utf8");

    expect(content).toContain("Gate 1 (S06 Trusted Compilation Baseline)");
    expect(content).toMatch(/Status:\*?\*?\s*PASS/i);
    expect(content).toContain("PUBLIC_SIGNUP_ENABLED=false");
    expect(content).toContain("QUOTA_EXCEEDED");
    expect(content).toContain("%PDF-");
    expect(content).toContain("Findings & Operational Safeguards");
  });
});
