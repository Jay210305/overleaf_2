import { describe, expect, it } from "vitest";
import {
  getTeXProfile,
  PROFILE_FIXTURES,
  resolveProfileArgv,
  SUPPORTED_COMPILERS,
  UnsupportedTeXProfileError,
} from "../../../apps/tex-executor/src/profiles.js";

describe("CMP-05 Regression: Alternative TeX Profiles and DVI Route", () => {
  it("ensures all four profiles are registered and adhere to CMP-05 invariants", () => {
    expect(SUPPORTED_COMPILERS).toContain("pdflatex");
    expect(SUPPORTED_COMPILERS).toContain("xelatex");
    expect(SUPPORTED_COMPILERS).toContain("lualatex");
    expect(SUPPORTED_COMPILERS).toContain("latex");

    const latexProfile = getTeXProfile("latex");
    expect(latexProfile.dviRoute).toBe(true);
    expect(latexProfile.latexmkEngineFlag).toBe("-pdfdvi");

    const xelatexProfile = getTeXProfile("xelatex");
    expect(xelatexProfile.latexmkEngineFlag).toBe("-xelatex");

    const lualatexProfile = getTeXProfile("lualatex");
    expect(lualatexProfile.latexmkEngineFlag).toBe("-lualatex");
  });

  it("ensures fixtures are defined for every supported compiler", () => {
    const fixtureCompilers = PROFILE_FIXTURES.map((f) => f.compiler);
    for (const compiler of SUPPORTED_COMPILERS) {
      expect(fixtureCompilers).toContain(compiler);
    }
  });

  it("verifies shell-escape is strictly forbidden across all profiles", () => {
    for (const compiler of SUPPORTED_COMPILERS) {
      const argv = resolveProfileArgv(compiler, {
        outDir: "/out",
        mainPath: "/input/main.tex",
      });
      expect(argv).toContain("-no-shell-escape");
      expect(argv).not.toContain("-shell-escape");
      expect(argv).not.toContain("--shell-escape");
    }
  });

  it("rejects unknown profiles", () => {
    expect(() => getTeXProfile("badengine")).toThrow(UnsupportedTeXProfileError);
  });
});
