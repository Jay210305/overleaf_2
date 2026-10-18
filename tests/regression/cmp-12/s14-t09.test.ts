import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CMP-12 S14-T09: Additional compiler packages and fonts compatibility regression", () => {
  const manifestPath = resolve(
    import.meta.dirname,
    "../../../apps/tex-executor/package-manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  it("verifies math packages are compatible across all primary engines", () => {
    const amsmath = manifest.packages.find((p: { name: string }) => p.name === "amsmath");
    expect(amsmath).toBeDefined();
    expect(amsmath.supportedEngines).toEqual(["pdflatex", "xelatex", "lualatex", "latex"]);
  });

  it("verifies Unicode font packages specify compatibility exceptions for pdflatex", () => {
    const fontspec = manifest.packages.find((p: { name: string }) => p.name === "fontspec");
    expect(fontspec).toBeDefined();
    expect(fontspec.supportedEngines).toContain("xelatex");
    expect(fontspec.supportedEngines).toContain("lualatex");
    expect(fontspec.incompatibleEngines).toContain("pdflatex");
    expect(fontspec.expectedExceptionOnIncompatible).toContain("cannot be used with pdfLaTeX");

    const firamath = manifest.packages.find((p: { name: string }) => p.name === "firamath");
    expect(firamath).toBeDefined();
    expect(firamath.supportedEngines).toEqual(["xelatex", "lualatex"]);
    expect(firamath.incompatibleEngines).toContain("pdflatex");
  });

  it("verifies presentation classes and typography packages specify correct support", () => {
    const beamer = manifest.packages.find((p: { name: string }) => p.name === "beamer");
    expect(beamer).toBeDefined();
    expect(beamer.type).toBe("class");
    expect(beamer.supportedEngines).toContain("pdflatex");

    const microtype = manifest.packages.find((p: { name: string }) => p.name === "microtype");
    expect(microtype).toBeDefined();
    expect(microtype.supportedEngines).toContain("pdflatex");
    expect(microtype.supportedEngines).toContain("lualatex");
  });
});
