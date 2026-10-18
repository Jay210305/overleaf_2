import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageEntry {
  name: string;
  type: "package" | "class" | "font";
  license: string;
  source: string;
  supportedEngines: string[];
  incompatibleEngines?: string[];
  expectedExceptionOnIncompatible?: string;
  fixture: string;
}

interface PackageManifest {
  manifestVersion: string;
  compilerImage: string;
  policy: {
    networkInstallOnDemand: boolean;
    shellEscape: boolean;
    securityConfigFile: string;
    compilerTrustBoundary: string;
  };
  packages: PackageEntry[];
}

describe("S14-T09 / CMP-12: Special packages and font profiles manifest", () => {
  const manifestPath = resolve(
    import.meta.dirname,
    "../../apps/tex-executor/package-manifest.json",
  );

  it("loads the compiler package manifest and enforces security policy", () => {
    expect(existsSync(manifestPath)).toBe(true);
    const content = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;

    expect(content.manifestVersion).toBe("1.0.0");
    expect(content.policy.networkInstallOnDemand).toBe(false);
    expect(content.policy.shellEscape).toBe(false);
    expect(content.policy.securityConfigFile).toBe("texmf.cnf");
    expect(content.packages.length).toBeGreaterThanOrEqual(5);
  });

  it("ensures every package and font has a verified license and real LaTeX fixture", () => {
    const content = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;

    for (const pkg of content.packages) {
      expect(pkg.name).toBeTruthy();
      expect(["package", "class", "font"]).toContain(pkg.type);
      expect(pkg.license).toMatch(/LPPL|OFL|GPL/);
      expect(pkg.source).toMatch(/^CTAN:/);
      expect(pkg.supportedEngines.length).toBeGreaterThan(0);
      expect(pkg.fixture).toContain("\\documentclass");
      expect(pkg.fixture).toContain("\\begin{document}");
    }
  });

  it("documents engine compatibility and expected exceptions for specialized packages", () => {
    const content = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;

    const fontspec = content.packages.find((p) => p.name === "fontspec");
    expect(fontspec).toBeDefined();
    expect(fontspec!.supportedEngines).toEqual(["xelatex", "lualatex"]);
    expect(fontspec!.incompatibleEngines).toContain("pdflatex");
    expect(fontspec!.expectedExceptionOnIncompatible).toBeDefined();

    const firamath = content.packages.find((p) => p.name === "firamath");
    expect(firamath).toBeDefined();
    expect(firamath!.type).toBe("font");
    expect(firamath!.license).toBe("OFL-1.1");
    expect(firamath!.supportedEngines).toEqual(["xelatex", "lualatex"]);
  });
});
