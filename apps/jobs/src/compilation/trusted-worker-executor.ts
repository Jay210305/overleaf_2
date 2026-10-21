import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  Compiler,
  CompilerExecutor,
  ExecuteInput,
  ExecuteOutput,
  ExecuteOutputArtifact,
  RevisionManifest,
} from "@latex-collab/contracts";
import type { ManifestItemLoader } from "./source-loader.js";
import { parseLatexLog, redactHostPaths, redactSecrets } from "@latex-collab/latex";

const execFileAsync = promisify(execFile);

export type CommandRunner = (
  cmd: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    signal: AbortSignal;
    timeoutMs: number;
    maxBuffer: number;
  },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type TrustedWorkerExecutorOptions = {
  runner?: CommandRunner;
  baseTempDir?: string;
  /**
   * Loads genuine frozen item bytes. When absent, the executor keeps its
   * historical dummy materialization used by unit fixtures. Production wiring
   * must provide the revision source loader so PDFs reflect user sources.
   */
  sourceLoader?: ManifestItemLoader | undefined;
};

const ALLOWED_ENGINES = new Set<Compiler>(["pdflatex", "xelatex", "lualatex", "latex"]);

type ManifestItem = RevisionManifest["items"][number];

/**
 * Selects the root document of a revision, the way a LaTeX project has one
 * document that pulls the rest in with \input and \include (CMP-01).
 *
 * Preference order: the project's configured main file, then `main.tex`, then
 * the shallowest `.tex` path so a single-chapter project still compiles.
 */
export function selectRootDocument(manifest: RevisionManifest): ManifestItem | undefined {
  const items = manifest.items;
  const configured = items.find((item) => item.nodeId === manifest.mainFileId);
  if (configured) return configured;
  const mainTex = items.find((item) => item.path === "main.tex");
  if (mainTex) return mainTex;
  return items
    .filter((item) => item.kind === "TEXT" && extname(item.path).toLowerCase() === ".tex")
    .sort((left, right) => {
      const depth = left.path.split("/").length - right.path.split("/").length;
      return depth !== 0 ? depth : left.path.localeCompare(right.path);
    })[0];
}

/** Output base name latexmk derives from the root document path. */
export function compilationJobName(rootPath: string): string {
  const stem = basename(rootPath).replace(/\.tex$/i, "");
  return /^[A-Za-z0-9._-]+$/.test(stem) && stem !== "." && stem !== ".." ? stem : "main";
}

/** Finds one compiler output by its expected name, then by extension. */
async function findOutput(outDir: string, fileName: string): Promise<string | null> {
  const expected = join(outDir, fileName);
  try {
    await readFile(expected);
    return expected;
  } catch {
    // Missing under the expected name; try the extension below.
  }
  try {
    const extension = extname(fileName).toLowerCase();
    const entries = await readdir(outDir, { withFileTypes: true });
    const match = entries
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === extension)
      .map((entry) => entry.name)
      .sort()[0];
    return match ? join(outDir, match) : null;
  } catch {
    return null;
  }
}

function sanitizeEnv(): Record<string, string> {
  const allowed = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP"];
  const cleanEnv: Record<string, string> = {
    LANG: "C.UTF-8",
  };
  for (const key of allowed) {
    if (process.env[key]) {
      cleanEnv[key] = process.env[key]!;
    }
  }
  return cleanEnv;
}

/**
 * Trusted worker compiler adapter executing TeX workloads in isolated ephemeral workspaces (S06-T13, CMP-01, PL-07).
 * - Strips all DB, Redis, and storage secrets from the compiler process environment.
 * - Enforces immutable input materialization in a clean temporary directory.
 * - Invokes latexmk with hardened flags (-no-shell-escape, -interaction=nonstopmode).
 * - Collects outputs into typed ExecuteOutput artifacts and cleans ephemeral directories.
 */
export class TrustedWorkerExecutor implements CompilerExecutor {
  private readonly runner: CommandRunner;
  private readonly baseTempDir?: string | undefined;
  private readonly sourceLoader?: ManifestItemLoader | undefined;

  constructor(options: TrustedWorkerExecutorOptions = {}) {
    this.baseTempDir = options.baseTempDir;
    this.sourceLoader = options.sourceLoader;
    this.runner =
      options.runner ??
      (async (cmd, args, opts) => {
        try {
          const { stdout, stderr } = await execFileAsync(cmd, args, {
            cwd: opts.cwd,
            env: opts.env,
            signal: opts.signal,
            timeout: opts.timeoutMs,
            maxBuffer: opts.maxBuffer,
          });
          return { exitCode: 0, stdout: String(stdout), stderr: String(stderr) };
        } catch (err: unknown) {
          const fault = err as { code?: number | string; stdout?: string; stderr?: string };
          const exitCode = typeof fault.code === "number" ? fault.code : 1;
          return {
            exitCode,
            stdout: String(fault.stdout ?? ""),
            stderr: String(fault.stderr ?? (err as Error).message),
          };
        }
      });
  }

  async execute(input: ExecuteInput, signal: AbortSignal): Promise<ExecuteOutput> {
    if (signal.aborted) {
      return {
        status: "cancelled",
        exitCode: null,
        diagnostics: [],
        artifacts: [],
      };
    }

    if (!ALLOWED_ENGINES.has(input.compiler)) {
      const error = new Error(`Unsupported compiler engine: ${input.compiler}`);
      (error as Error & { code?: string }).code = "VALIDATION_ERROR";
      throw error;
    }

    const tempRoot = await mkdtemp(join(this.baseTempDir ?? tmpdir(), `compile-${input.jobId}-`));
    const inputDir = join(tempRoot, "input");
    const outDir = join(tempRoot, "out");

    try {
      await mkdir(inputDir, { recursive: true });
      await mkdir(outDir, { recursive: true });

      // Materialize genuine frozen manifest items into input directory.
      // relative() comparison is separator-aware so the traversal guard holds on Windows and POSIX.
      for (const item of input.manifest.items) {
        // Prevent path traversal
        const targetPath = resolve(inputDir, item.path);
        const rel = relative(inputDir, targetPath);
        if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
          throw new Error(`Path traversal rejected: ${item.path}`);
        }
        await mkdir(resolve(targetPath, ".."), { recursive: true });
        let loaded: Uint8Array | null = null;
        if (this.sourceLoader) {
          try {
            loaded = await this.sourceLoader(input.manifest, item);
          } catch (err) {
            throw new Error(
              `Source unavailable for ${item.path}: ${(err as Error)?.message ?? String(err)}`,
            );
          }
        }
        if (loaded && loaded.length > 0) {
          await writeFile(targetPath, loaded);
        } else if (this.sourceLoader) {
          throw new Error(`Source unavailable for ${item.path}: empty frozen content`);
        } else {
          // Fixture-only fallback when no source loader is configured.
          await writeFile(targetPath, "dummy content", "utf8");
        }
      }

      // With -outdir, \include writes chapters/<name>.aux inside the output
      // directory, so mirror the source subdirectories there; otherwise a project
      // with \include{chapters/capitulo_1} stops with "I can't write on file".
      for (const item of input.manifest.items) {
        const itemDir = dirname(item.path);
        if (!itemDir || itemDir === ".") continue;
        const targetDir = resolve(outDir, itemDir);
        const relDir = relative(outDir, targetDir);
        if (relDir.startsWith("..") || isAbsolute(relDir)) continue;
        await mkdir(targetDir, { recursive: true });
      }

      // Compile the revision's root document, not a fixed file name, so projects
      // whose main document is tesis.tex compile like they do in Overleaf.
      const rootPath = selectRootDocument(input.manifest)?.path ?? "main.tex";
      const jobName = compilationJobName(rootPath);
      const rootAbsolute = resolve(inputDir, rootPath);
      try {
        await readFile(rootAbsolute);
      } catch {
        if (this.sourceLoader) {
          throw new Error(`Main document ${rootPath} not found in revision`);
        }
        // Fixture-only fallback when no source loader is configured.
        await mkdir(resolve(rootAbsolute, ".."), { recursive: true });
        await writeFile(
          rootAbsolute,
          "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}",
          "utf8",
        );
      }

      // Clean environment (strips private credentials)
      const sanitizedEnv = sanitizeEnv();

      // Arguments for hardened TeX compilation
      let engineFlag = "-pdf";
      if (input.compiler === "xelatex") {
        engineFlag = "-xelatex";
      } else if (input.compiler === "lualatex") {
        engineFlag = "-lualatex";
      } else if (input.compiler === "latex") {
        engineFlag = "-pdfdvi";
      }
      const args = [
        engineFlag,
        "-interaction=nonstopmode",
        "-file-line-error",
        "-synctex=1",
        "-no-shell-escape",
        `-outdir=${outDir}`,
        rootPath,
      ];

      const timeoutMs = (input.limits?.timeoutSeconds ?? 60) * 1000;
      const maxBuffer = input.limits?.maxOutputBytes ?? 25 * 1024 * 1024;

      const runResult = await this.runner("latexmk", args, {
        cwd: inputDir,
        env: sanitizedEnv,
        signal,
        timeoutMs,
        maxBuffer,
      });

      const artifacts: ExecuteOutputArtifact[] = [];

      // Collect outputs from outDir
      const pdfPath = await findOutput(outDir, `${jobName}.pdf`);
      if (pdfPath) {
        const pdfBytes = await readFile(pdfPath);
        const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
        artifacts.push({
          name: "output.pdf",
          mime: "application/pdf",
          bytes: new Uint8Array(pdfBytes),
          sha256,
        });
      }

      // Diagnostics come from the final LaTeX pass only: latexmk's stdout also
      // contains earlier passes, whose already-resolved warnings would otherwise
      // be reported as current problems.
      let diagnosticsSource = `${runResult.stdout}\n${runResult.stderr}`;
      const logPath = await findOutput(outDir, `${jobName}.log`);
      if (logPath) {
        const rawLogBytes = await readFile(logPath);
        const decoded = new TextDecoder().decode(rawLogBytes);
        diagnosticsSource = decoded;
        const sanitizedLog = redactHostPaths(redactSecrets(decoded), tempRoot);
        const logBytes = new TextEncoder().encode(sanitizedLog);
        const sha256 = createHash("sha256").update(logBytes).digest("hex");
        artifacts.push({
          name: "compile.log",
          mime: "text/plain",
          bytes: logBytes,
          sha256,
        });
      }

      const { diagnostics } = parseLatexLog(diagnosticsSource, { workDir: tempRoot });

      const status =
        runResult.exitCode === 0 && artifacts.some((a) => a.name === "output.pdf")
          ? "succeeded"
          : "failed";

      return {
        status,
        exitCode: runResult.exitCode,
        diagnostics,
        artifacts,
      };
    } finally {
      // Ephemeral cleanup on completion, error, or cancellation
      await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}
