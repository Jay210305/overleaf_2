import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("PL-01 frozen installation", () => {
  it("rejects a changed manifest without rewriting the committed lockfile", () => {
    const fixture = mkdtempSync(join(tmpdir(), "s00-t03-"));
    try {
      copyFileSync(join(root, "pnpm-lock.yaml"), join(fixture, "pnpm-lock.yaml"));
      copyFileSync(join(root, "pnpm-workspace.yaml"), join(fixture, "pnpm-workspace.yaml"));
      const originalLock = readFileSync(join(fixture, "pnpm-lock.yaml"), "utf8");
      const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
      manifest.devDependencies = { ...(manifest.devDependencies as Record<string, string>), "new-unlocked-dependency": "1.0.0" };
      writeFileSync(join(fixture, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      const args = ["install", "--frozen-lockfile", "--lockfile-only", "--offline"];
      const result = process.platform === "win32"
        ? spawnSync("cmd.exe", ["/d", "/s", "/c", `pnpm ${args.join(" ")}`], { cwd: fixture, encoding: "utf8" })
        : spawnSync("pnpm", args, { cwd: fixture, encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/OUTDATED_LOCKFILE|lockfile.*out.of.date|frozen/i);
      expect(readFileSync(join(fixture, "pnpm-lock.yaml"), "utf8")).toBe(originalLock);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
