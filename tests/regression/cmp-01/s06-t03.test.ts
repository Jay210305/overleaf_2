import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CMP-01 Pinned TeX Live image specification (S06-T03)", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const dockerfilePath = resolve(root, "apps/tex-executor/Dockerfile");

  it("declares pinned package manifest including latexmk, biber, and standard TeX packages", () => {
    expect(existsSync(dockerfilePath)).toBe(true);
    const dockerfile = readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).toContain("texlive-latex-base");
    expect(dockerfile).toContain("texlive-latex-recommended");
    expect(dockerfile).toContain("latexmk");
    expect(dockerfile).toContain("biber");
  });

  it("specifies PDF compilation target with standard synctex flag for genuine PDF generation", () => {
    const dockerfile = readFileSync(dockerfilePath, "utf8");
    expect(dockerfile).toContain("-pdf");
    expect(dockerfile).toContain("-synctex=1");
  });
});
