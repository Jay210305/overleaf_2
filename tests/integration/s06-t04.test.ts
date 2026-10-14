import { describe, expect, it } from "vitest";
import {
  type ExecuteInput,
  IsolatedCompilerExecutor,
  MockCompilerExecutor,
} from "@latex-collab/contracts";

describe("S06-T04 Compiler executor boundary integration", () => {
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

  it("IsolatedCompilerExecutor fails closed with NOT_IMPLEMENTED error", async () => {
    const isolated = new IsolatedCompilerExecutor();

    await expect(isolated.execute()).rejects.toThrow(
      "Public untrusted execution is NOT_IMPLEMENTED (fails closed)",
    );
  });

  it("MockCompilerExecutor satisfies CompilerExecutor boundary and handles execution signals", async () => {
    const mock = new MockCompilerExecutor();
    const controller = new AbortController();

    const output = await mock.execute(dummyInput, controller.signal);
    expect(output.status).toBe("succeeded");
    expect(output.exitCode).toBe(0);
    expect(output.artifacts.length).toBeGreaterThan(0);
    expect(output.artifacts[0]!.name).toBe("output.pdf");

    // Test AbortSignal
    controller.abort();
    const abortedOutput = await mock.execute(dummyInput, controller.signal);
    expect(abortedOutput.status).toBe("cancelled");
  });
});
