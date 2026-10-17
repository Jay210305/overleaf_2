import { describe, expect, it } from "vitest";
import { IsolatedCompilerExecutor } from "../../apps/jobs/src/compilation/isolated-executor.js";
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
  timeoutSeconds: 30,
  maxOutputBytes: 10 * 1024 * 1024,
  memoryMiB: 512,
  cpuCores: 1,
};

describe("S15-T02: TeX escape and resource attack containment integration", () => {
  it("isolates concurrent compilations and prevents workspace cross-talk", async () => {
    const jobAWorkspaces: string[] = [];
    const jobBWorkspaces: string[] = [];

    const executor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args, opts) => {
        if (opts.cwd.includes("job-a")) {
          jobAWorkspaces.push(opts.cwd);
        } else {
          jobBWorkspaces.push(opts.cwd);
        }
        const outDir = args.find((a) => a.startsWith("-outdir="))!.split("=")[1]!;
        await writeFile(join(outDir, "main.pdf"), "%PDF-dummy");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const inputA: ExecuteInput = {
      jobId: "job-a-111",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-a"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    const inputB: ExecuteInput = {
      jobId: "job-b-222",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-b"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    const [resA, resB] = await Promise.all([
      executor.execute(inputA, new AbortController().signal),
      executor.execute(inputB, new AbortController().signal),
    ]);

    expect(resA.status).toBe("succeeded");
    expect(resB.status).toBe("succeeded");
    expect(jobAWorkspaces[0]).not.toBe(jobBWorkspaces[0]);
  });

  it("handles memory and buffer exhaustion safely", async () => {
    const executor = new IsolatedCompilerExecutor({
      maxScratchSizeBytes: 500, // Strict small limit
    });

    const largeInput: ExecuteInput = {
      jobId: "large-job",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-large", [
        {
          nodeId: "n1",
          path: "large1.tex",
          kind: "TEXT",
          object: { key: "b1", sha256: "h1", sizeBytes: 300, mime: "text/x-tex" },
        },
        {
          nodeId: "n2",
          path: "large2.tex",
          kind: "TEXT",
          object: { key: "b2", sha256: "h2", sizeBytes: 300, mime: "text/x-tex" },
        },
      ]),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    await expect(executor.execute(largeInput, new AbortController().signal)).rejects.toThrowError(
      /limit exceeded/i,
    );
  });
});
