import { describe, expect, it } from "vitest";
import {
  executeWithLimits,
  resolveCompilationLimits,
} from "../../apps/tex-executor/src/execute.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("S06-T05 Enforce trusted compiler execution limits integration", () => {
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
      timeoutSeconds: 60,
      memoryMiB: 512,
      cpuCores: 1,
      maxOutputBytes: 25 * 1024 * 1024,
    },
  };

  it("clamps client-supplied arbitrary limits to server policy bounds", () => {
    // Excessive timeout requested (e.g. 999999s)
    const clamped = resolveCompilationLimits({
      timeoutSeconds: 999999,
      memoryMiB: 100000,
      cpuCores: 64,
      maxOutputBytes: 1024 * 1024 * 1024,
    });

    expect(clamped.timeoutSeconds).toBe(60);
    expect(clamped.memoryMiB).toBe(512);
    expect(clamped.cpuCores).toBe(1);
    expect(clamped.maxOutputBytes).toBe(25 * 1024 * 1024);
  });

  it("aborts execution exceeding timeout limit and returns timed_out status", async () => {
    // Short timeout for test
    const input: ExecuteInput = {
      ...dummyInput,
      limits: {
        ...dummyInput.limits,
        timeoutSeconds: 1,
      },
    };

    const output = await executeWithLimits(input, async (signal) => {
      // Simulate infinite loop in TeX compilation
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

    expect(output.status).toBe("timed_out");
    expect(output.exitCode).toBe(124);
    expect(output.diagnostics.some((d) => d.message.includes("exceeded execution timeout"))).toBe(true);
  });

  it("rejects compilation producing artifacts beyond maxOutputBytes cap (25 MiB)", async () => {
    const input: ExecuteInput = {
      ...dummyInput,
      limits: {
        ...dummyInput.limits,
        maxOutputBytes: 1024, // 1 KiB cap for test
      },
    };

    const output = await executeWithLimits(input, async () => {
      return {
        status: "succeeded",
        exitCode: 0,
        diagnostics: [],
        artifacts: [
          {
            name: "huge.pdf",
            mime: "application/pdf",
            bytes: new Uint8Array(2048), // 2 KiB exceeds 1 KiB
            sha256: "huge-sha256",
          },
        ],
      };
    });

    expect(output.status).toBe("failed");
    expect(output.diagnostics.some((d) => d.message.includes("exceeded maximum allowed size"))).toBe(true);
  });

  it("handles parent cancellation cleanly", async () => {
    const parentController = new AbortController();
    parentController.abort();

    const output = await executeWithLimits(
      dummyInput,
      async () => ({
        status: "succeeded",
        exitCode: 0,
        diagnostics: [],
        artifacts: [],
      }),
      parentController.signal,
    );

    expect(output.status).toBe("cancelled");
  });
});
