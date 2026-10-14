import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrustedWorkerExecutor, type CommandRunner } from "../../apps/jobs/src/compilation/trusted-worker-executor.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("S06-T13 Trusted worker executor adapter integration", () => {
  const sampleInput: ExecuteInput = {
    jobId: "00000000-0000-0000-0000-000000000001",
    manifest: {
      version: 1,
      projectId: "00000000-0000-0000-0000-000000000002",
      revisionId: "00000000-0000-0000-0000-000000000003",
      revisionNo: 1,
      mainFileId: "00000000-0000-0000-0000-000000000004",
      compiler: "pdflatex",
      texliveImageDigest: "texlive:2024",
      items: [
        {
          nodeId: "00000000-0000-0000-0000-000000000004",
          path: "main.tex",
          kind: "TEXT",
          object: {
            key: "blobs/123",
            sha256: "abc",
            sizeBytes: 100,
            mime: "text/x-tex",
          },
        },
      ],
    },
    compiler: "pdflatex",
    imageDigest: "texlive:2024",
    policyVersion: "1.0.0",
    limits: {
      timeoutSeconds: 60,
      memoryMiB: 512,
      cpuCores: 1,
      maxOutputBytes: 25 * 1024 * 1024,
    },
  };

  it("materializes ephemeral workdir, runs hardened latexmk flags, and cleans up directory", async () => {
    let capturedArgs: string[] = [];
    let capturedEnv: Record<string, string> = {};
    let capturedCwd = "";

    const testRunner: CommandRunner = async (cmd, args, opts) => {
      capturedArgs = args;
      capturedEnv = opts.env;
      capturedCwd = opts.cwd;

      // Simulate output artifact creation by compiler
      const outDirMatch = args.find((a) => a.startsWith("-outdir="));
      const outDir = outDirMatch ? outDirMatch.slice("-outdir=".length) : "";
      await writeFile(join(outDir, "main.pdf"), new Uint8Array([37, 80, 68, 70]));
      await writeFile(join(outDir, "main.log"), "Transcript log output", "utf8");

      return { exitCode: 0, stdout: "Success", stderr: "" };
    };

    const executor = new TrustedWorkerExecutor({ runner: testRunner });
    const output = await executor.execute(sampleInput, new AbortController().signal);

    expect(output.status).toBe("succeeded");
    expect(output.exitCode).toBe(0);
    expect(output.artifacts.some((a) => a.name === "output.pdf")).toBe(true);
    expect(output.artifacts.some((a) => a.name === "compile.log")).toBe(true);

    // Hardened flags check
    expect(capturedArgs).toContain("-no-shell-escape");
    expect(capturedArgs).toContain("-interaction=nonstopmode");

    // Secret isolation check: verify sensitive env vars stripped
    expect(capturedEnv["DATABASE_URL"]).toBeUndefined();
    expect(capturedEnv["REDIS_URL"]).toBeUndefined();
    expect(capturedEnv["S3_SECRET_ACCESS_KEY"]).toBeUndefined();
    expect(capturedCwd).toContain("compile-");
  });

  it("rejects path traversal attempts in manifest item paths", async () => {
    const maliciousInput: ExecuteInput = {
      ...sampleInput,
      manifest: {
        ...sampleInput.manifest,
        items: [
          {
            nodeId: "00000000-0000-0000-0000-000000000009",
            path: "../../etc/shadow",
            kind: "TEXT",
            object: {
              key: "blobs/bad",
              sha256: "bad",
              sizeBytes: 10,
              mime: "text/plain",
            },
          },
        ],
      },
    };

    const executor = new TrustedWorkerExecutor();
    await expect(
      executor.execute(maliciousInput, new AbortController().signal),
    ).rejects.toThrow("Path traversal rejected");
  });

  it("rejects unsupported compiler engine with VALIDATION_ERROR", async () => {
    const badEngineInput: ExecuteInput = {
      ...sampleInput,
      compiler: "custom_bash_script" as unknown as ExecuteInput["compiler"],
    };

    const executor = new TrustedWorkerExecutor();
    await expect(
      executor.execute(badEngineInput, new AbortController().signal),
    ).rejects.toThrow("Unsupported compiler engine");
  });
});
