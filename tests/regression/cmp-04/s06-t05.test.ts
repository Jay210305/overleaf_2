import { describe, expect, it } from "vitest";
import { executeWithLimits } from "../../../apps/tex-executor/src/execute.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("CMP-04 Durable timed_out status from execution limits (S06-T05)", () => {
  it("maps timeout abort to timed_out status conforming to contract lifecycle", async () => {
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
        timeoutSeconds: 1,
        memoryMiB: 512,
        cpuCores: 1,
        maxOutputBytes: 25 * 1024 * 1024,
      },
    };

    const result = await executeWithLimits(input, async (signal) => {
      return new Promise((resolve) => {
        signal.addEventListener("abort", () => {
          resolve({
            status: "failed",
            exitCode: null,
            diagnostics: [],
            artifacts: [],
          });
        });
      });
    });

    expect(result.status).toBe("timed_out");
  });
});
