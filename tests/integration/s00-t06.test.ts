import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { assertBrowserPackageBoundary } from "../../scripts/check-workspace";
it.each([
  "/packages/db/src/client.ts",
  "@private/db",
  "node:fs",
  "@latex-collab/config/server",
  "../../api/src/server",
])("denies browser import %s", (specifier) => {
  const root = mkdtempSync(join(tmpdir(), "s00-boundary-"));
  try {
    mkdirSync(join(root, "apps/web/src"), { recursive: true });
    writeFileSync(
      join(root, "apps/web/package.json"),
      JSON.stringify({ dependencies: { "@latex-collab/config": "workspace:*" } }),
    );
    writeFileSync(join(root, "apps/web/src/leak.ts"), `import "${specifier}";`);
    expect(() => assertBrowserPackageBoundary(root)).toThrow(
      "Browser source cannot import private module",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("denies computed browser imports whose target cannot be checked", () => {
  const root = mkdtempSync(join(tmpdir(), "s00-dynamic-"));
  try {
    mkdirSync(join(root, "apps/web/src"), { recursive: true });
    writeFileSync(join(root, "apps/web/package.json"), JSON.stringify({ dependencies: {} }));
    writeFileSync(
      join(root, "apps/web/src/leak.ts"),
      'const target = "../../api/src/server"; import(target);',
    );
    expect(() => assertBrowserPackageBoundary(root)).toThrow("unresolved dynamic imports");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
