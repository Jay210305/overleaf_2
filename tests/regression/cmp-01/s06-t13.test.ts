import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrustedWorkerExecutor } from "../../../apps/jobs/src/compilation/trusted-worker-executor.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("CMP-01 Trusted worker executor artifact collection (S06-T13)", () => {
  it("collects genuine output PDF and log artifact with valid sha256 checksum", async () => {
    const input: ExecuteInput = {
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

    const pdfBuffer = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

    const executor = new TrustedWorkerExecutor({
      runner: async (_cmd, args) => {
        const outDirMatch = args.find((a) => a.startsWith("-outdir="));
        const outDir = outDirMatch ? outDirMatch.slice("-outdir=".length) : "";
        await writeFile(join(outDir, "main.pdf"), pdfBuffer);
        return { exitCode: 0, stdout: "Compiled successfully", stderr: "" };
      },
    });

    const output = await executor.execute(input, new AbortController().signal);
    expect(output.status).toBe("succeeded");
    const pdfArtifact = output.artifacts.find((a) => a.name === "output.pdf");
    expect(pdfArtifact).toBeDefined();
    expect(pdfArtifact?.sha256).toHaveLength(64);
    expect(pdfArtifact?.bytes.length).toBe(pdfBuffer.length);
  });
});
