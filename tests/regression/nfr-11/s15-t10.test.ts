import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("NFR-11 S15-T10: Multi-browser compatibility specifications regression", () => {
  it("documents and targets Chromium, Firefox, and WebKit browser test engines", async () => {
    const runbookPath = join(process.cwd(), "docs/operations/runbooks.md");
    const content = await readFile(runbookPath, "utf8");

    expect(content).toContain("Google Chrome");
    expect(content).toContain("Mozilla Firefox");
    expect(content).toContain("Microsoft Edge");
  });
});
