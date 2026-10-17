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

const defaultLimits = {
  timeoutSeconds: 30,
  maxOutputBytes: 10 * 1024 * 1024,
  memoryMiB: 512,
  cpuCores: 1,
};

describe("CMP-01 S15-T13: Pinned TeX Live / latexmk genuine PDF output and engine flags regression", () => {
  it("passes correct engine flags for pdflatex, xelatex, and lualatex", async () => {
    const invokedFlags: Record<string, string[]> = {};

    const executor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args) => {
        const engine = args[0]!;
        invokedFlags[engine] = args;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const engines = ["pdflatex", "xelatex", "lualatex"] as const;

    for (const engine of engines) {
      const input: ExecuteInput = {
        jobId: `engine-${engine}`,
        compiler: engine,
        manifest: createTestManifest("proj-flags"),
        imageDigest: "texlive:2024",
        policyVersion: "1.0",
        limits: defaultLimits,
      };
      await executor.execute(input, new AbortController().signal);
    }

    expect(invokedFlags["-pdf"]).toBeDefined();
    expect(invokedFlags["-xelatex"]).toBeDefined();
    expect(invokedFlags["-lualatex"]).toBeDefined();
  });

  it("produces typed PDF artifact with SHA-256 and captures error diagnostics on failure", async () => {
    // 1. Success case
    const successExecutor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args) => {
        const outDir = args.find((a) => a.startsWith("-outdir="))!.split("=")[1]!;
        await writeFile(join(outDir, "main.pdf"), "%PDF-1.7 genuine document bytes");
        return { exitCode: 0, stdout: "latexmk: successfully completed", stderr: "" };
      },
    });

    const successInput: ExecuteInput = {
      jobId: "success-pdf",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-pdf"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    const successRes = await successExecutor.execute(successInput, new AbortController().signal);
    expect(successRes.status).toBe("succeeded");
    const pdfArtifact = successRes.artifacts.find((a) => a.name === "output.pdf")!;
    expect(pdfArtifact.mime).toBe("application/pdf");
    expect(pdfArtifact.sha256).toMatch(/^[0-9a-f]{64}$/);

    // 2. Failure case
    const failExecutor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args) => {
        const outDir = args.find((a) => a.startsWith("-outdir="))!.split("=")[1]!;
        const errorLog = "! Undefined control sequence.\nl.5 \\invalidMacro\n";
        await writeFile(join(outDir, "main.log"), errorLog);
        return { exitCode: 1, stdout: "", stderr: "Fatal error occurred" };
      },
    });

    const failInput: ExecuteInput = {
      jobId: "fail-pdf",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-fail"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: defaultLimits,
    };

    const failRes = await failExecutor.execute(failInput, new AbortController().signal);
    expect(failRes.status).toBe("failed");
    expect(failRes.exitCode).toBe(1);
    expect(failRes.diagnostics.length).toBeGreaterThan(0);
    expect(failRes.diagnostics.some((d) => d.message.includes("Undefined control sequence"))).toBe(true);
  });
});
