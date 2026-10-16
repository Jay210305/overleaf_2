import { describe, expect, it } from "vitest";
import { type ExecuteInput, MockCompilerExecutor } from "@latex-collab/contracts";

describe("CMP-01 Compiler executor boundary returns typed artifacts (S06-T04)", () => {
  it("enforces ExecuteOutput contract structure with PDF artifact and diagnostics array", async () => {
    const executor = new MockCompilerExecutor((_input) => ({
      status: "succeeded",
      exitCode: 0,
      diagnostics: [
        {
          severity: "info",
          message: "Output written on output.pdf (1 page, 26132 bytes).",
        },
      ],
      artifacts: [
        {
          name: "output.pdf",
          mime: "application/pdf",
          bytes: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 53]),
          sha256: "genuine-sha256",
        },
      ],
    }));

    const result = await executor.execute(
      {} as unknown as ExecuteInput,
      new AbortController().signal,
    );
    expect(result.status).toBe("succeeded");
    expect(result.artifacts.some((a) => a.name === "output.pdf")).toBe(true);
    expect(result.diagnostics.length).toBe(1);
  });
});
