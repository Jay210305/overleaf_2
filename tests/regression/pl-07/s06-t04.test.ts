import { describe, expect, it } from "vitest";
import { IsolatedCompilerExecutor } from "@latex-collab/contracts";

describe("PL-07 Isolated compiler fails closed until G5 verification (S06-T04)", () => {
  it("IsolatedCompilerExecutor refuses execution and reports NOT_IMPLEMENTED error code", async () => {
    const executor = new IsolatedCompilerExecutor();
    try {
      await executor.execute();
      expect.fail("Expected IsolatedCompilerExecutor to throw");
    } catch (err: unknown) {
      expect((err as Error).message).toContain("fails closed");
      expect((err as { code?: string }).code).toBe("NOT_IMPLEMENTED");
    }
  });
});
