import { describe, expect, it } from "vitest";
import { resolveCompilationLimits, DEFAULT_COMPILATION_LIMITS } from "../../../apps/tex-executor/src/execute.js";

describe("NFR-07 Server bounds on resource limits (S06-T05)", () => {
  it("enforces server ceiling: requested memory or cores cannot exceed policy defaults", () => {
    const limits = resolveCompilationLimits({
      memoryMiB: 2048, // Requesting 2 GiB
      cpuCores: 8,     // Requesting 8 cores
    });

    expect(limits.memoryMiB).toBe(DEFAULT_COMPILATION_LIMITS.memoryMiB); // 512
    expect(limits.cpuCores).toBe(DEFAULT_COMPILATION_LIMITS.cpuCores);   // 1
  });
});
