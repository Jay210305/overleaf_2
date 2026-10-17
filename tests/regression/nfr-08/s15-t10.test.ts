import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("NFR-08 S15-T10: WCAG 2.2 AA target and keyboard navigation regression", () => {
  it("enforces axe-core tags and keyboard focus rules in accessibility specifications", async () => {
    const e2eSpecPath = join(process.cwd(), "tests/e2e/release-accessibility.spec.ts");
    const spec = await readFile(e2eSpecPath, "utf8");

    // Must target WCAG 2.2 AA
    expect(spec).toContain("wcag22aa");
    expect(spec).toContain("wcag2aa");

    // Must test keyboard interactions
    expect(spec).toContain("keyboard.press");
    expect(spec).toContain("Escape");
  });
});
