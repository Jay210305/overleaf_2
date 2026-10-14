import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PL-07 Trusted execution and closed public mode documentation (S06-T11)", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const docPath = resolve(root, "docs/operations/trusted-compilation.md");

  it("ensures operations documentation exists and covers closed public mode", () => {
    expect(existsSync(docPath)).toBe(true);
    const content = readFileSync(docPath, "utf8");

    expect(content).toContain("PUBLIC_SIGNUP_ENABLED=false");
    expect(content).toContain("UNTRUSTED_COMPILE_ENABLED=false");
    expect(content).toContain("Zero Credential Injection");
    expect(content).toContain("Dedicated Worker vs. Verified Public Isolation");
  });

  it("verifies explicit warning that dedicated worker is not verified public isolation", () => {
    const content = readFileSync(docPath, "utf8");
    expect(content).toMatch(/does not constitute verified multi-tenant adversarial public isolation/i);
    expect(content).toMatch(/Sprint 15/);
  });
});
