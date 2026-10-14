import { describe, expect, it } from "vitest";
import { resolveCompilationLimits } from "../../../apps/tex-executor/src/execute.js";

describe("PL-07 Finite compiler resource caps (S06-T05)", () => {
  it("never permits unbounded output bytes or indefinite execution time", () => {
    const limits = resolveCompilationLimits({
      timeoutSeconds: Number.POSITIVE_INFINITY,
      maxOutputBytes: Number.POSITIVE_INFINITY,
    });

    expect(Number.isFinite(limits.timeoutSeconds)).toBe(true);
    expect(limits.timeoutSeconds).toBeLessThanOrEqual(60);
    expect(Number.isFinite(limits.maxOutputBytes)).toBe(true);
    expect(limits.maxOutputBytes).toBeLessThanOrEqual(25 * 1024 * 1024);
  });
});
