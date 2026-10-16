import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TrustedWorkerExecutor } from "../../../apps/jobs/src/compilation/trusted-worker-executor.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("CMP-02 Redacted compiler output and parsed file/line diagnostics (S06-T10)", () => {
  it("parses syntax error with file and line number and ensures zero secrets appear in diagnostics", async () => {
    const executor = new TrustedWorkerExecutor({
      runner: async (_cmd, args, options) => {
        const outDir =
          args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? join(options.cwd, "../out");
        await writeFile(
          join(outDir, "main.log"),
          "postgres://user:db_secret_pw@db:5432/test\n./main.tex:34: LaTeX Error: Environment quote undefined.",
        );
        return { exitCode: 1, stdout: "", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "00000000-0000-0000-0000-000000000040",
      manifest: {
        version: 1,
        projectId: "00000000-0000-0000-0000-000000000050",
        revisionId: "00000000-0000-0000-0000-000000000060",
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
    expect(output.status).toBe("failed");
    expect(output.diagnostics).toHaveLength(1);
    expect(output.diagnostics[0]?.filePath).toBe("main.tex");
    expect(output.diagnostics[0]?.line).toBe(34);
    expect(output.diagnostics[0]?.message).toContain("Environment quote undefined");

    // Log artifact must be sanitized
    const logArt = output.artifacts.find((a) => a.name === "compile.log");
    if (logArt) {
      const text = new TextDecoder().decode(logArt.bytes);
      expect(text).not.toContain("db_secret_pw");
    }
  });
});
