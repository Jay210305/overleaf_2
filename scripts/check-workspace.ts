import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

type Manifest = {
  name?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
};

const expectedPackages = ["@latex-collab/contracts", "@latex-collab/config"] as const;

function readManifest(root: string, path: string): Manifest {
  return JSON.parse(readFileSync(join(root, path, "package.json"), "utf8")) as Manifest;
}

export function assertBrowserPackageBoundary(root: string): void {
  const browser = readManifest(root, "apps/web");
  for (const dependency of Object.keys(browser.dependencies ?? {})) {
    if (dependency.startsWith("@latex-collab/") && !expectedPackages.includes(dependency as (typeof expectedPackages)[number])) {
      throw new Error(`Browser workspace cannot depend on private package ${dependency}`);
    }
  }

  const webRoot = resolve(root, "apps/web");
  const sourceRoot = join(webRoot, "src");
  if (!existsSync(sourceRoot)) return;

  function visitDirectory(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        visitDirectory(file);
      } else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
        const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
        function visit(node: ts.Node): void {
          let specifier: string | undefined;
          if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            specifier = node.moduleSpecifier.text;
          } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!)) {
            if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) {
              specifier = node.arguments[0]!.text;
            }
          }
          if (specifier) {
            const privatePackage = specifier.startsWith("@latex-collab/") && !expectedPackages.includes(specifier as (typeof expectedPackages)[number]);
            const outsideApp = specifier.startsWith(".") && (() => {
              const path = relative(webRoot, resolve(dirname(file), specifier));
              return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
            })();
            if (privatePackage || outsideApp) {
              throw new Error(`Browser source cannot import private module in ${relative(root, file)}`);
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }

  visitDirectory(sourceRoot);
}

export function assertWorkspaceConfiguration(root: string): void {
  const expected = [
    ["apps/web", "@latex-collab/web"],
    ["apps/api", "@latex-collab/api"],
    ["packages/contracts", "@latex-collab/contracts"],
    ["packages/config", "@latex-collab/config"],
  ] as const;

  for (const [path, name] of expected) {
    const manifest = readManifest(root, path);
    if (manifest.name !== name || manifest.private !== true) {
      throw new Error(`Invalid workspace manifest: ${path}`);
    }
  }
  for (const app of ["apps/web", "apps/api"]) {
    const manifest = readManifest(root, app);
    for (const name of expectedPackages) {
      if (manifest.dependencies?.[name] !== "workspace:*") {
        throw new Error(`${app} must resolve ${name} locally`);
      }
    }
  }
  assertBrowserPackageBoundary(root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertWorkspaceConfiguration(process.cwd());
}
