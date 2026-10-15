import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBrowserPackageBoundary,
  assertWorkspaceConfiguration,
} from "../../scripts/check-workspace";

const root = resolve(import.meta.dirname, "../..");
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;
function runPnpm(args: string[]) {
  return process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `pnpm ${args.join(" ")}`], {
        cwd: root,
        encoding: "utf8",
      })
    : spawnSync("pnpm", args, { cwd: root, encoding: "utf8" });
}

describe("S00-T03 typed pnpm workspace", () => {
  it("pins the available package manager and exposes real quality commands", () => {
    const manifest = readJson("package.json");
    const version = runPnpm(["--version"]);
    expect(version.status, version.stderr).toBe(0);
    expect(manifest.packageManager).toBe(`pnpm@${version.stdout.trim()}`);
    expect(manifest.scripts).toMatchObject({
      lint: expect.any(String),
      typecheck: expect.any(String),
      build: expect.any(String),
    });
    expect(existsSync(join(root, "pnpm-lock.yaml"))).toBe(true);
  });

  it("resolves browser and API consumers to local typed packages", () => {
    const result = runPnpm(["--recursive", "list", "--depth", "-1", "--json"]);
    expect(result.status, result.stderr).toBe(0);
    const projects = JSON.parse(result.stdout) as Array<{ name: string }>;
    expect(projects.map((project) => project.name)).toEqual(
      expect.arrayContaining([
        "@latex-collab/web",
        "@latex-collab/api",
        "@latex-collab/contracts",
        "@latex-collab/config",
      ]),
    );
    for (const app of ["web", "api"]) {
      const manifest = readJson(`apps/${app}/package.json`);
      expect(manifest.dependencies).toMatchObject({
        "@latex-collab/contracts": "workspace:*",
        "@latex-collab/config": "workspace:*",
      });
      for (const packageName of ["@latex-collab/contracts", "@latex-collab/config"]) {
        const resolved = spawnSync(
          process.execPath,
          ["-p", `require.resolve('${packageName}/package.json')`],
          {
            cwd: join(root, "apps", app),
            encoding: "utf8",
          },
        );
        expect(resolved.status, resolved.stderr).toBe(0);
        expect(resolved.stdout.replaceAll("\\", "/")).toContain(
          `/packages/${packageName.split("/")[1]}/package.json`,
        );
      }
    }
  });

  it(
    "keeps strict TypeScript active for the workspace",
    () => {
      const config = readJson("tsconfig.base.json");
      expect(config.compilerOptions).toMatchObject({ strict: true, noEmit: true });
      const result = runPnpm(["typecheck"]);
      expect(result.status, result.stderr || result.stdout).toBe(0);
    },
    120_000,
  );

  it("rejects a secret-bearing browser workspace dependency", () => {
    const fixture = mkdtempSync(join(tmpdir(), "s00-t03-browser-"));
    try {
      mkdirSync(join(fixture, "apps", "web"), { recursive: true });
      copyFileSync(
        join(root, "apps", "web", "package.json"),
        join(fixture, "apps", "web", "package.json"),
      );
      const manifest = JSON.parse(
        readFileSync(join(fixture, "apps", "web", "package.json"), "utf8"),
      ) as { dependencies: Record<string, string> };
      manifest.dependencies["@latex-collab/db"] = "workspace:*";
      writeFileSync(join(fixture, "apps", "web", "package.json"), JSON.stringify(manifest));
      expect(() => assertBrowserPackageBoundary(fixture)).toThrow(
        /Browser workspace cannot depend/,
      );
      expect(readJson("apps/web/package.json")).not.toHaveProperty("dependencies.@latex-collab/db");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("rejects a direct browser source import from a private workspace package", () => {
    const fixture = mkdtempSync(join(tmpdir(), "s00-t03-import-"));
    try {
      mkdirSync(join(fixture, "apps", "web", "src"), { recursive: true });
      copyFileSync(
        join(root, "apps", "web", "package.json"),
        join(fixture, "apps", "web", "package.json"),
      );
      writeFileSync(
        join(fixture, "apps", "web", "src", "leak.ts"),
        'import { secret } from "@latex-collab/db";\n',
      );
      expect(() => assertBrowserPackageBoundary(fixture)).toThrow(/Browser source cannot import/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("rejects an app with a missing local package declaration", () => {
    const fixture = mkdtempSync(join(tmpdir(), "s00-t03-config-"));
    try {
      for (const path of ["apps/web", "apps/api", "packages/contracts", "packages/config"]) {
        mkdirSync(join(fixture, path), { recursive: true });
        copyFileSync(join(root, path, "package.json"), join(fixture, path, "package.json"));
      }
      const webPath = join(fixture, "apps/web/package.json");
      const manifest = JSON.parse(readFileSync(webPath, "utf8")) as {
        dependencies: Record<string, string>;
      };
      delete manifest.dependencies["@latex-collab/config"];
      writeFileSync(webPath, JSON.stringify(manifest));
      expect(() => assertWorkspaceConfiguration(fixture)).toThrow(/must resolve.*locally/);
      expect(readJson("apps/web/package.json").dependencies).toHaveProperty(
        "@latex-collab/config",
        "workspace:*",
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
