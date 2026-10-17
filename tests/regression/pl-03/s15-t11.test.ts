import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("PL-03 S15-T11: Feature traceability and honest evidence regression", () => {
  it("enforces stable requirement mapping in feature-parity.md", async () => {
    const parityPath = join(process.cwd(), "docs/feature-parity.md");
    const content = await readFile(parityPath, "utf8");

    // All major invariants must be indexed
    expect(content).toContain("ACC-01");
    expect(content).toContain("CMP-01");
    expect(content).toContain("COL-01");
    expect(content).toContain("NFR-01");
    expect(content).toContain("PL-07");
  });
});
