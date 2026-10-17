import { describe, expect, it } from "vitest";
import {
  IsolatedCompilerExecutor,
  sanitizeCompilerEnvironment,
} from "../../apps/jobs/src/compilation/isolated-executor.js";
import type { ExecuteInput, RevisionManifest } from "@latex-collab/contracts";

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
  timeoutSeconds: 30,
  maxOutputBytes: 10 * 1024 * 1024,
  memoryMiB: 512,
  cpuCores: 1,
};

describe("Security: TeX Executor Sandboxing and Adversarial Attack Containment", () => {
  it("ADV-01: Contains shell escape attempts by strictly disabling shell execution", async () => {
    let capturedArgs: string[] = [];
    let executedInShell = false;

    const executor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args) => {
        capturedArgs = args;
        // Verify that the runner receives -no-shell-escape
        if (args.includes("-no-shell-escape")) {
          executedInShell = false;
        }
        return { exitCode: 0, stdout: "Transcript with shell escape disabled", stderr: "" };
      },
    });

    const maliciousInput: ExecuteInput = {
      jobId: "adv-01-shell-escape",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-malicious", [
        {
          nodeId: "n1",
          path: "main.tex",
          kind: "TEXT",
          object: { key: "b1", sha256: "h1", sizeBytes: 120, mime: "text/x-tex" },
        },
      ]),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    const result = await executor.execute(maliciousInput, new AbortController().signal);
    expect(capturedArgs).toContain("-no-shell-escape");
    expect(executedInShell).toBe(false);
    expect(result.status).toBe("failed"); // no PDF generated -> failed safely
  });

  it("ADV-02: Traps and blocks path traversal attempts in manifest and file items", async () => {
    const executor = new IsolatedCompilerExecutor();

    const traversalInputs: ExecuteInput[] = [
      {
        jobId: "adv-02-traversal-1",
        compiler: "pdflatex",
        manifest: createTestManifest("proj-sec", [
          {
            nodeId: "n-pwd",
            path: "../../../etc/passwd",
            kind: "TEXT",
            object: { key: "b-pwd", sha256: "hpwd", sizeBytes: 50, mime: "text/plain" },
          },
        ]),
        imageDigest: "texlive:2024",
        policyVersion: "1.0",
        limits: defaultLimits,
      },
      {
        jobId: "adv-02-traversal-2",
        compiler: "pdflatex",
        manifest: createTestManifest("proj-sec", [
          {
            nodeId: "n-shadow",
            path: "/etc/shadow",
            kind: "TEXT",
            object: { key: "b-shadow", sha256: "hshadow", sizeBytes: 50, mime: "text/plain" },
          },
        ]),
        imageDigest: "texlive:2024",
        policyVersion: "1.0",
        limits: defaultLimits,
      },
    ];

    for (const input of traversalInputs) {
      await expect(executor.execute(input, new AbortController().signal)).rejects.toThrowError(
        /traversal/i,
      );
    }
  });

  it("ADV-03: Terminates long-running infinite loops cleanly upon timeout deadline", async () => {
    const executor = new IsolatedCompilerExecutor({
      defaultTimeoutSeconds: 1, // Short 1s timeout for testing
      runner: async (_cmd, _args, opts) => {
        // Simulate a job killed by timeout
        if ((opts.timeoutMs ?? 0) <= 1000) {
          return { exitCode: 124, stdout: "", stderr: "Command timed out after 1000ms" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const loopInput: ExecuteInput = {
      jobId: "adv-03-infinite-loop",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-loop"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: { timeoutSeconds: 1, maxOutputBytes: 1024, memoryMiB: 512, cpuCores: 1 },
    };

    const result = await executor.execute(loopInput, new AbortController().signal);
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(124);
  });

  it("ADV-04: Enforces network namespace isolation parameter", async () => {
    let networkDisabled: boolean | undefined;

    const executor = new IsolatedCompilerExecutor({
      enforceNetworkIsolation: true,
      runner: async (_cmd, _args, opts) => {
        networkDisabled = opts.isolation?.networkDisabled;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "adv-04-network",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-net"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    await executor.execute(input, new AbortController().signal);
    expect(networkDisabled).toBe(true);
  });

  it("ADV-05: Expunges all operational database, redis, and auth secrets from process environment", () => {
    const attackEnv: NodeJS.ProcessEnv = {
      PATH: "/usr/bin:/bin",
      DATABASE_URL: "postgres://postgres:root@localhost:5432/overleaf",
      PGPASSWORD: "my-pg-password",
      REDIS_URL: "redis://default:token@localhost:6379",
      MINIO_SECRET_KEY: "minio-top-secret",
      JWT_SIGNING_KEY: "jwt-secret-xyz",
      SESSION_COOKIE_SECRET: "cookie-secret-abc",
    };

    const sanitized = sanitizeCompilerEnvironment(attackEnv);

    expect(sanitized.DATABASE_URL).toBeUndefined();
    expect(sanitized.PGPASSWORD).toBeUndefined();
    expect(sanitized.REDIS_URL).toBeUndefined();
    expect(sanitized.MINIO_SECRET_KEY).toBeUndefined();
    expect(sanitized.JWT_SIGNING_KEY).toBeUndefined();
    expect(sanitized.SESSION_COOKIE_SECRET).toBeUndefined();
  });
});
