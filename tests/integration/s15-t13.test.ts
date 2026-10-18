import { describe, expect, it } from "vitest";
import {
  IsolatedCompilerExecutor,
  sanitizeCompilerEnvironment,
} from "../../apps/jobs/src/compilation/isolated-executor.js";
import type { ExecuteInput, RevisionManifest } from "@latex-collab/contracts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

function createTestManifest(projectId: string, items: RevisionManifest["items"] = []): RevisionManifest {
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

const defaultLimits = {
  timeoutSeconds: 15,
  maxOutputBytes: 10 * 1024 * 1024,
  memoryMiB: 512,
  cpuCores: 1,
};

describe("S15-T13: Provision verified isolated executor adapter integration", () => {
  it("executes valid TeX job producing output.pdf and sanitized compile.log", async () => {
    let capturedOptions: {
      timeoutMs?: number;
      env?: Record<string, string>;
      maxBuffer?: number;
      isolation?: {
        networkDisabled?: boolean;
        readOnlyRoot?: boolean;
        dropCapabilities?: boolean;
        noNewPrivileges?: boolean;
        userUid?: number;
      };
    } | undefined;

    const executor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args, opts) => {
        capturedOptions = opts;
        // Simulate successful latexmk execution by generating a dummy PDF in out dir
        const outDir = args.find((a) => a.startsWith("-outdir="))!.split("=")[1]!;
        await writeFile(join(outDir, "main.pdf"), "%PDF-1.5 test content");
        await writeFile(join(outDir, "main.log"), "Output written on main.pdf (1 page).\nTranscript written on main.log.");

        return { exitCode: 0, stdout: "latexmk completed", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "test-job-s15-t13",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-1234", [
        {
          nodeId: "n1",
          path: "main.tex",
          kind: "TEXT",
          object: { key: "blob-1", sha256: "hash-1", sizeBytes: 100, mime: "text/x-tex" },
        },
      ]),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    const controller = new AbortController();
    const result = await executor.execute(input, controller.signal);

    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
    expect(result.artifacts.some((a) => a.name === "output.pdf")).toBe(true);
    expect(result.artifacts.some((a) => a.name === "compile.log")).toBe(true);

    // Verify isolation parameters passed to runner
    expect(capturedOptions?.isolation?.networkDisabled).toBe(true);
    expect(capturedOptions?.isolation?.readOnlyRoot).toBe(true);
    expect(capturedOptions?.isolation?.dropCapabilities).toBe(true);
    expect(capturedOptions?.isolation?.noNewPrivileges).toBe(true);
  });

  it("strictly enforces -no-shell-escape flag", async () => {
    let capturedArgs: string[] = [];

    const executor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args) => {
        capturedArgs = args;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "shell-escape-test",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-sec"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    await executor.execute(input, new AbortController().signal);
    expect(capturedArgs).toContain("-no-shell-escape");
    expect(capturedArgs).toContain("-interaction=nonstopmode");
  });

  it("rejects path traversal in manifest items", async () => {
    const executor = new IsolatedCompilerExecutor();
    const input: ExecuteInput = {
      jobId: "traversal-test",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-bad", [
        {
          nodeId: "n-bad",
          path: "../../etc/shadow",
          kind: "TEXT",
          object: { key: "blob-evil", sha256: "h", sizeBytes: 50, mime: "text/plain" },
        },
      ]),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    await expect(executor.execute(input, new AbortController().signal)).rejects.toThrowError(
      /traversal/i,
    );
  });

  it("handles cancelled signal cleanly", async () => {
    const executor = new IsolatedCompilerExecutor();
    const controller = new AbortController();
    controller.abort();

    const input: ExecuteInput = {
      jobId: "cancelled-test",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-cancel"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    const result = await executor.execute(input, controller.signal);
    expect(result.status).toBe("cancelled");
    expect(result.exitCode).toBeNull();
    expect(result.artifacts).toHaveLength(0);
  });

  it("sanitizes environment removing credentials and tokens (PL-07)", () => {
    const dirtyEnv: NodeJS.ProcessEnv = {
      PATH: "/usr/bin:/bin",
      HOME: "/home/user",
      DATABASE_URL: "postgres://user:secretpass@localhost:5432/db",
      REDIS_PASSWORD: "super-secret-redis",
      MINIO_SECRET_KEY: "minio-admin-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret-key",
      JWT_SECRET: "jwt-signing-secret",
      API_TOKEN: "sensitive-token",
    };

    const cleanEnv = sanitizeCompilerEnvironment(dirtyEnv);

    expect(cleanEnv.PATH).toBe("/usr/bin:/bin");
    expect(cleanEnv.DATABASE_URL).toBeUndefined();
    expect(cleanEnv.REDIS_PASSWORD).toBeUndefined();
    expect(cleanEnv.MINIO_SECRET_KEY).toBeUndefined();
    expect(cleanEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(cleanEnv.JWT_SECRET).toBeUndefined();
    expect(cleanEnv.API_TOKEN).toBeUndefined();
  });
});
