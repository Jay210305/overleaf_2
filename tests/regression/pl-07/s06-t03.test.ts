import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PL-07 Explicit compiler trust boundary and secret isolation (S06-T03)", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const dockerfilePath = resolve(root, "apps/tex-executor/Dockerfile");
  const texmfPath = resolve(root, "apps/tex-executor/texmf.cnf");

  it("prohibits shell escape in both Dockerfile arguments and texmf configuration", () => {
    const dockerfile = readFileSync(dockerfilePath, "utf8");
    const texmf = readFileSync(texmfPath, "utf8");

    expect(dockerfile).toContain("-no-shell-escape");
    expect(texmf).toMatch(/^\s*shell_escape\s*=\s*f/m);
  });

  it("verifies unprivileged runtime user UID is distinct from root", () => {
    const dockerfile = readFileSync(dockerfilePath, "utf8");
    expect(dockerfile).toMatch(/useradd\s+-u\s+10001/);
    expect(dockerfile).toContain("USER texrunner");
  });
});
