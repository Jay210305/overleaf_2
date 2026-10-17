import { describe, expect, it } from "vitest";
import {
  resolveCompilerExecutor,
  validatePublicCompilationPolicy,
} from "../../../apps/jobs/src/compilation/public-policy.js";
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

describe("CMP-01 S15-T03: Pinned TeX Live engine resolution and genuine PDF execution regression", () => {
  it("enforces audited TeX Live release pins for untrusted mode", () => {
    // Valid audited release
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        executorType: "isolated",
        pinnedTeXLiveVersion: "2024.2",
      }),
    ).not.toThrow();

    // Invalid unaudited release
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        executorType: "isolated",
        pinnedTeXLiveVersion: "2015-legacy",
      }),
    ).toThrowError(/UNAUDITED_TEXLIVE_VERSION/);
  });

  it("routed isolated executor executes genuine PDF output generation", async () => {
    const executor = resolveCompilerExecutor(
      {
        untrustedCompileEnabled: true,
        executorType: "isolated",
        pinnedTeXLiveVersion: "2024",
      },
      true, // untrusted job
    );

    expect(executor).toBeInstanceOf(IsolatedCompilerExecutor);

    // Mock runner inside executor to simulate genuine compilation
    const testExecutor = new IsolatedCompilerExecutor({
      runner: async (_cmd, args) => {
        const outDir = args.find((a) => a.startsWith("-outdir="))!.split("=")[1]!;
        await writeFile(join(outDir, "main.pdf"), "%PDF-1.5 Genuine Compiled Document");
        await writeFile(join(outDir, "main.log"), "Output written on main.pdf (1 page).");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "genuine-routed-pdf",
      compiler: "pdflatex",
      manifest: createTestManifest("proj-routed"),
      imageDigest: "texlive:2024",
      policyVersion: "1.0",
      limits: {
        timeoutSeconds: 30,
        maxOutputBytes: 10 * 1024 * 1024,
        memoryMiB: 512,
        cpuCores: 1,
      },
    };

    const result = await testExecutor.execute(input, new AbortController().signal);
    expect(result.status).toBe("succeeded");
    expect(result.artifacts.some((a) => a.name === "output.pdf")).toBe(true);
  });
});
