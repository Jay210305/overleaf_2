import { describe, expect, it } from "vitest";
import { TrustedWorkerExecutor } from "../../../apps/jobs/src/compilation/trusted-worker-executor.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("PL-07 Secret isolation in compiler process (S06-T13)", () => {
  it("never passes sensitive environment variables into TeX runner invocation", async () => {
    // Inject mock sensitive env vars into process.env
    process.env["DATABASE_URL"] = "postgres://secret:secret@127.0.0.1/db";
    process.env["REDIS_URL"] = "redis://secret@127.0.0.1:6379";
    process.env["S3_SECRET_ACCESS_KEY"] = "super-secret-aws-key";

    let passedEnv: Record<string, string> = {};

    const executor = new TrustedWorkerExecutor({
      runner: async (cmd, args, opts) => {
        passedEnv = opts.env;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const dummyInput: ExecuteInput = {
      jobId: "00000000-0000-0000-0000-000000000001",
      manifest: {
        version: 1,
        projectId: "00000000-0000-0000-0000-000000000002",
        revisionId: "00000000-0000-0000-0000-000000000003",
        revisionNo: 1,
        mainFileId: "00000000-0000-0000-0000-000000000004",
        compiler: "pdflatex",
        texliveImageDigest: "texlive:2024",
        items: [],
      },
      compiler: "pdflatex",
      imageDigest: "texlive:2024",
      policyVersion: "1.0.0",
      limits: {
        timeoutSeconds: 30,
        memoryMiB: 256,
        cpuCores: 1,
        maxOutputBytes: 10 * 1024 * 1024,
      },
    };

    await executor.execute(dummyInput, new AbortController().signal);

    expect(passedEnv["DATABASE_URL"]).toBeUndefined();
    expect(passedEnv["REDIS_URL"]).toBeUndefined();
    expect(passedEnv["S3_SECRET_ACCESS_KEY"]).toBeUndefined();
  });
});
