import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProfileArgv, TEX_PROFILES } from "../../apps/tex-executor/src/profiles.js";

describe("S14-T09: Compiler package profiling and security isolation", () => {
  const manifestPath = resolve(import.meta.dirname, "../../apps/tex-executor/package-manifest.json");
  const texmfPath = resolve(import.meta.dirname, "../../apps/tex-executor/texmf.cnf");

  it("manifest strictly disables network package installs and shell escape", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.policy.networkInstallOnDemand).toBe(false);
    expect(manifest.policy.shellEscape).toBe(false);

    expect(existsSync(texmfPath)).toBe(true);
    const texmf = readFileSync(texmfPath, "utf8");
    expect(texmf).toContain("shell_escape = f");
    expect(texmf).toContain("openin_any = p");
    expect(texmf).toContain("openout_any = p");
  });

  it("enforces fixed secure compilation argv for all supported profiles", () => {
    for (const [engine, profile] of Object.entries(TEX_PROFILES)) {
      const argv = resolveProfileArgv(engine, {
        outDir: "/tmp/safe-out",
        mainPath: "/tmp/safe-out/main.tex",
      });
      expect(argv).toContain("-no-shell-escape");
      expect(argv).toContain("-interaction=nonstopmode");
      expect(argv).toContain(profile.latexmkEngineFlag);
    }
  });

  it("every manifest entry contains non-empty source fixture and license metadata", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const item of manifest.packages) {
      expect(item.license).toBeTruthy();
      expect(item.source).toBeTruthy();
      expect(item.fixture.length).toBeGreaterThan(20);
      expect(item.fixture).toContain("\\begin{document}");
    }
  });
});
