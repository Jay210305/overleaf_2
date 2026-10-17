import { describe, expect, it } from "vitest";
import { IsolatedCompilerExecutor } from "../../../apps/jobs/src/compilation/isolated-executor.js";
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

describe("NFR-07 S15-T02: Concurrent jobs stay within quotas and limits regression", () => {
  it("enforces independent timeouts and quotas across concurrent compilation jobs", async () => {
    let fastJobFinished = false;
    let slowJobFinished = false;

    const executor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args, opts) => {
        const outDir = args.find((a) => a.startsWith("-outdir="))!.split("=")[1]!;
        if (opts.cwd.includes("slow-job")) {
          // Slow job exceeds short timeout
          if ((opts.timeoutMs ?? 0) < 500) {
            slowJobFinished = true;
            return { exitCode: 124, stdout: "", stderr: "Timed out" };
          }
        } else {
          // Fast job completes
          fastJobFinished = true;
          await writeFile(join(outDir, "main.pdf"), "%PDF-fast");
          return { exitCode: 0, stdout: "Fast job success", stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const fastInput: ExecuteInput = {
      jobId: "fast-job",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-nfr07"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: {
        timeoutSeconds: 5,
        maxOutputBytes: 10 * 1024 * 1024,
        memoryMiB: 512,
        cpuCores: 1,
      },
    };

    const slowInput: ExecuteInput = {
      jobId: "slow-job",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-nfr07"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: {
        timeoutSeconds: 0.2,
        maxOutputBytes: 10 * 1024 * 1024,
        memoryMiB: 512,
        cpuCores: 1,
      },
    };

    const [fastResult, slowResult] = await Promise.all([
      executor.execute(fastInput, new AbortController().signal),
      executor.execute(slowInput, new AbortController().signal),
    ]);

    expect(fastJobFinished).toBe(true);
    expect(slowJobFinished).toBe(true);
    expect(fastResult.status).toBe("succeeded");
    expect(slowResult.status).toBe("failed");
    expect(slowResult.exitCode).toBe(124);
  });
});
