import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PL-07 S14-T09: Compiler trust boundary and license compliance regression", () => {
  const manifestPath = resolve(
    import.meta.dirname,
    "../../../apps/tex-executor/package-manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const texmfPath = resolve(import.meta.dirname, "../../../apps/tex-executor/texmf.cnf");
  const texmf = readFileSync(texmfPath, "utf8");

  it("verifies compiler trust boundary strictly isolates execution without network access", () => {
    expect(manifest.policy.compilerTrustBoundary).toBe("isolated-container");
    expect(manifest.policy.networkInstallOnDemand).toBe(false);
    expect(manifest.policy.shellEscape).toBe(false);

    // texmf.cnf disallows \write18 and unrestricted file opening
    expect(texmf).toMatch(/shell_escape\s*=\s*f/);
    expect(texmf).toMatch(/openin_any\s*=\s*p/);
    expect(texmf).toMatch(/openout_any\s*=\s*p/);
  });

  it("ensures all bundled packages comply with approved open licenses without unauthorized code reuse", () => {
    const approvedLicenses = ["LPPL-1.3c", "OFL-1.1", "GPL-2.0", "LPPL-1.3c / GPL-2.0"];
    for (const pkg of manifest.packages) {
      expect(approvedLicenses).toContain(pkg.license);
      expect(pkg.source).toMatch(/^CTAN:/);
    }
  });
});
