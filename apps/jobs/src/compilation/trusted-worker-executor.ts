import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type {
  Compiler,
  CompilerExecutor,
  ExecuteInput,
  ExecuteOutput,
  ExecuteOutputArtifact,
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

      // Check for main.tex
      const mainPath = join(inputDir, "main.tex");
      try {
        await readFile(mainPath);
      } catch {
        if (this.sourceLoader) {
          throw new Error("Main source main.tex not found in revision");
        }
        // If main.tex not present, write basic document to avoid empty compilation
        await writeFile(
          mainPath,
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
        mainPath,
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
      try {
        const pdfBytes = await readFile(join(outDir, "main.pdf"));
        const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
        artifacts.push({
          name: "output.pdf",
          mime: "application/pdf",
          bytes: new Uint8Array(pdfBytes),
          sha256,
        });
      } catch {
        // PDF not generated
      }

      let rawLog = `${runResult.stdout}\n${runResult.stderr}`;
      try {
        const rawLogBytes = await readFile(join(outDir, "main.log"));
        const decoded = new TextDecoder().decode(rawLogBytes);
        rawLog = `${decoded}\n${rawLog}`;
        const sanitizedLog = redactHostPaths(redactSecrets(decoded), tempRoot);
        const logBytes = new TextEncoder().encode(sanitizedLog);
        const sha256 = createHash("sha256").update(logBytes).digest("hex");
        artifacts.push({
          name: "compile.log",
          mime: "text/plain",
          bytes: logBytes,
          sha256,
        });
      } catch {
        // Log not generated
      }

      const { diagnostics } = parseLatexLog(rawLog, { workDir: tempRoot });

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
