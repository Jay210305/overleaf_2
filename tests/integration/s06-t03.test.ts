import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S06-T03 Pinned TeX Live image configuration integration", () => {
  const root = resolve(import.meta.dirname, "../..");
  const dockerfilePath = resolve(root, "apps/tex-executor/Dockerfile");
  const texmfPath = resolve(root, "apps/tex-executor/texmf.cnf");

  it("verifies Dockerfile exists and uses pinned image digest with unprivileged user", () => {
    expect(existsSync(dockerfilePath)).toBe(true);
    const dockerfile = readFileSync(dockerfilePath, "utf8");

    // Base image pinned with SHA-256 digest
    expect(dockerfile).toMatch(/^FROM\s+[^\s]+@sha256:[a-f0-9]{64}/m);

    // Unprivileged user setup
    expect(dockerfile).toContain("useradd -u 10001");
    expect(dockerfile).toContain("USER texrunner");

    // Hardened command with -no-shell-escape
    expect(dockerfile).toContain("-no-shell-escape");
    expect(dockerfile).toContain("-interaction=nonstopmode");
    expect(dockerfile).toContain("-file-line-error");
  });

  it("verifies Dockerfile contains zero database, redis, or object-store credentials", () => {
    const dockerfile = readFileSync(dockerfilePath, "utf8");

    const forbiddenPatterns = [
      /DATABASE_URL/i,
      /REDIS_URL/i,
      /S3_SECRET_ACCESS_KEY/i,
      /POSTGRES_PASSWORD/i,
      /MINIO_ROOT_PASSWORD/i,
      /SECRET_KEY/i,
      /TOKEN/i,
    ];

    for (const pattern of forbiddenPatterns) {
      expect(dockerfile).not.toMatch(pattern);
    }
  });

  it("verifies texmf.cnf disables shell escape and restricts file open traversal", () => {
    expect(existsSync(texmfPath)).toBe(true);
    const texmf = readFileSync(texmfPath, "utf8");

    // shell_escape disabled
    expect(texmf).toMatch(/^\s*shell_escape\s*=\s*f/m);

    // Restrict parent traversal
    expect(texmf).toMatch(/^\s*openin_any\s*=\s*p/m);
    expect(texmf).toMatch(/^\s*openout_any\s*=\s*p/m);
  });
});
