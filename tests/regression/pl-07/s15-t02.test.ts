import { describe, expect, it } from "vitest";
import {
  IsolatedCompilerExecutor,
  sanitizeCompilerEnvironment,
} from "../../../apps/jobs/src/compilation/isolated-executor.js";
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

describe("PL-07 S15-T02: Adversarial escape prevention and trust boundary regression", () => {
  it("enforces shell escape lockout on adversarial payloads", async () => {
    let capturedArgs: string[] = [];

    const executor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args) => {
        capturedArgs = args;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const attackInput: ExecuteInput = {
      jobId: "adv-shell-pl07",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-pl07"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: {
        timeoutSeconds: 30,
        maxOutputBytes: 10 * 1024 * 1024,
        memoryMiB: 512,
        cpuCores: 1,
      },
    };

    await executor.execute(attackInput, new AbortController().signal);
    expect(capturedArgs).toContain("-no-shell-escape");
    expect(capturedArgs).not.toContain("-shell-escape");
  });

  it("scrubs internal connection strings and API tokens from execution environment", () => {
    const rawEnv: NodeJS.ProcessEnv = {
      PATH: "/usr/bin:/bin",
      DATABASE_URL: "postgresql://app:pass@db:5432/latex",
      REDIS_URL: "redis://cache:6379",
      S3_SECRET_KEY: "minio-top-secret",
      SESSION_SECRET: "session-secret",
    };

    const sanitized = sanitizeCompilerEnvironment(rawEnv);

    expect(sanitized.DATABASE_URL).toBeUndefined();
    expect(sanitized.REDIS_URL).toBeUndefined();
    expect(sanitized.S3_SECRET_KEY).toBeUndefined();
    expect(sanitized.SESSION_SECRET).toBeUndefined();
  });
});
