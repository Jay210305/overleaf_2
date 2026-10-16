import { describe, it, expect } from "vitest";
import type { Compiler } from "@latex-collab/contracts";
import {
  TEX_PROFILES,
  SUPPORTED_COMPILERS,
  resolveProfileArgv,
} from "../../../apps/tex-executor/src/profiles.js";

describe("Regression CMP-05 (S10-T10): Alternative TeX Profile Isolation and Execution Flags", () => {
  it("ensures all engine profiles disallow shell escapes and enforce interaction=nonstopmode", () => {
    for (const engine of SUPPORTED_COMPILERS) {
      const argv = resolveProfileArgv(engine as Compiler, {
        outDir: "/out",
        mainPath: "/input/main.tex",
      });
      expect(argv).toContain("-interaction=nonstopmode");
      expect(argv).toContain("-no-shell-escape");
      expect(argv).toContain("-synctex=1");
    }
  });

  it("ensures latex profile targets pdfdvi output", () => {
    expect(TEX_PROFILES.latex.latexmkEngineFlag).toBe("-pdfdvi");
    const argv = resolveProfileArgv("latex", { outDir: "/out", mainPath: "/input/main.tex" });
    expect(argv).toContain("-pdfdvi");
  });

  it("ensures xelatex profile targets -xelatex output", () => {
    expect(TEX_PROFILES.xelatex.latexmkEngineFlag).toBe("-xelatex");
    const argv = resolveProfileArgv("xelatex", { outDir: "/out", mainPath: "/input/main.tex" });
    expect(argv).toContain("-xelatex");
  });

  it("ensures lualatex profile targets -lualatex output", () => {
    expect(TEX_PROFILES.lualatex.latexmkEngineFlag).toBe("-lualatex");
    const argv = resolveProfileArgv("lualatex", { outDir: "/out", mainPath: "/input/main.tex" });
    expect(argv).toContain("-lualatex");
  });
});
