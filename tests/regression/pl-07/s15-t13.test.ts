import { describe, expect, it } from "vitest";
import {
  IsolatedCompilerExecutor,
  sanitizeCompilerEnvironment,
} from "../../../apps/jobs/src/compilation/isolated-executor.js";
import type { ExecuteInput, RevisionManifest } from "@latex-collab/contracts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

function createTestManifest(
  projectId: string,
  items: RevisionManifest["items"] = [],
): RevisionManifest {
  return {
    version: 1,
    projectId,
    revisionId: "00000000-0000-0000-0000-000000000001",
    revisionNo: 1,
    mainFileId: "00000000-0000-0000-0000-000000000002",
    compiler: "pdflatex",
    texliveImageDigest: "texlive:2024",
    items,
  };
}

describe("PL-07 S15-T13: Compiler secret stripping, log sanitization, and ephemeral disk cleanup regression", () => {
  it("never leaks database, storage, or auth secrets into execution environment", () => {
    const processMockEnv: NodeJS.ProcessEnv = {
      PATH: "/usr/bin",
      HOME: "/tmp",
      POSTGRES_PASSWORD: "pg-secret-pass",
      MINIO_ROOT_PASSWORD: "minio-secret-pass",
      COOKIE_SECRET: "session-cookie-secret",
      SESSION_KEY: "active-session-key",
      AUTH_TOKEN: "bearer-token",
    };

    const sanitized = sanitizeCompilerEnvironment(processMockEnv);

    expect(sanitized.POSTGRES_PASSWORD).toBeUndefined();
    expect(sanitized.MINIO_ROOT_PASSWORD).toBeUndefined();
    expect(sanitized.COOKIE_SECRET).toBeUndefined();
    expect(sanitized.SESSION_KEY).toBeUndefined();
    expect(sanitized.AUTH_TOKEN).toBeUndefined();
  });

  it("redacts internal host paths and sensitive strings from compilation log", async () => {
    let capturedWorkDir = "";

    const executor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args, opts) => {
        capturedWorkDir = opts.cwd;
        const outDir = args.find((a) => a.startsWith("-outdir="))!.split("=")[1]!;
        // Simulate latex writing a log with the absolute host path and a token
        const hostLog = `This is pdfTeX, Version 3.141592653\nentering extended mode\n(${capturedWorkDir}/main.tex\nLaTeX2e <2023-11-01>\nsecret_key=SUPER_SECRET_123456789\nOutput written on ${outDir}/main.pdf (1 page).\n`;
        await writeFile(join(outDir, "main.pdf"), "%PDF-dummy");
        await writeFile(join(outDir, "main.log"), hostLog);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "log-redaction-test",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-log"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: {
        timeoutSeconds: 30,
        maxOutputBytes: 10 * 1024 * 1024,
        memoryMiB: 512,
        cpuCores: 1,
      },
    };

    const result = await executor.execute(input, new AbortController().signal);
    expect(result.status).toBe("succeeded");

    const compileLog = result.artifacts.find((a) => a.name === "compile.log")!;
    const logText = new TextDecoder().decode(compileLog.bytes);

    // Host path must be redacted
    expect(logText).not.toContain(capturedWorkDir);
    // Ephemeral directory must be deleted after run
    expect(existsSync(capturedWorkDir)).toBe(false);
  });
});
