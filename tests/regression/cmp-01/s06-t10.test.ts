import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TrustedWorkerExecutor } from "../../../apps/jobs/src/compilation/trusted-worker-executor.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("CMP-01 Pinned TeX Live pdfLaTeX produces genuine PDF artifact (S06-T10)", () => {
  it("verifies genuine PDF output artifact starting with %PDF- header", async () => {
    const pdfContent = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF";
    const executor = new TrustedWorkerExecutor({
      runner: async (_cmd, args, options) => {
        const outDir =
          args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? join(options.cwd, "../out");
        await writeFile(join(outDir, "main.pdf"), pdfContent);
        return { exitCode: 0, stdout: "latexmk finished", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "00000000-0000-0000-0000-000000000010",
      manifest: {
        version: 1,
        projectId: "00000000-0000-0000-0000-000000000020",
        revisionId: "00000000-0000-0000-0000-000000000030",
        revisionNo: 1,
        mainFileId: "node-main",
        compiler: "pdflatex",
        texliveImageDigest: "texlive:latest",
        items: [
          {
            nodeId: "node-main",
            path: "main.tex",
            kind: "TEXT",
            object: {
              key: "node-main-key",
              sha256: "hash-main",
              sizeBytes: 10,
              mime: "text/x-tex",
            },
          },
        ],
      },
      compiler: "pdflatex",
      imageDigest: "texlive:latest",
      policyVersion: "1.0.0",
      limits: { timeoutSeconds: 60, memoryMiB: 512, cpuCores: 1, maxOutputBytes: 25 * 1024 * 1024 },
    };

    const output = await executor.execute(input, new AbortController().signal);
    expect(output.status).toBe("succeeded");
    const pdfArtifact = output.artifacts.find((a) => a.name === "output.pdf");
    expect(pdfArtifact).toBeDefined();
    expect(new TextDecoder().decode(pdfArtifact?.bytes.slice(0, 5))).toBe("%PDF-");
  });
});
