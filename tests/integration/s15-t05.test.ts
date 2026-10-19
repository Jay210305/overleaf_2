import { describe, expect, it } from "vitest";
import { computePercentiles, runSimulatedBenchmark } from "../load/workspace.js";
import {
  validatePublicCompilationPolicy,
  PolicyViolationError,
} from "../../apps/jobs/src/compilation/public-policy.js";

describe("S15-T05: REST, WS, and compile load benchmarking", () => {
  it("calculates latency percentiles accurately across sample distributions", () => {
    // 100 samples from 1 to 100
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    const stats = computePercentiles(samples);

    expect(stats.count).toBe(100);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(100);
    expect(stats.p50).toBe(51);
    expect(stats.p95).toBe(96);
    expect(stats.p99).toBe(100);
    expect(stats.mean).toBe(50.5);
  });

  it("measures CRUD and WS propagation latencies meeting NFR-04 and NFR-05 thresholds across 10/50/100 stages", async () => {
    const report = await runSimulatedBenchmark([10, 50, 100]);

    expect(report.allPassed).toBe(true);
    expect(report.stages[10]!.passedThresholds).toBe(true);
    expect(report.stages[50]!.passedThresholds).toBe(true);
    expect(report.stages[100]!.passedThresholds).toBe(true);

    // Verify NFR-04: CRUD p95 <= 500ms
    expect(report.stages[100]!.crudLatency.p95).toBeLessThanOrEqual(500);

    // Verify NFR-05: WS p95 <= 300ms
    expect(report.stages[100]!.wsLatency.p95).toBeLessThanOrEqual(300);
  });

  it("ensures public load never bypasses compilation isolation checks", () => {
    // Untrusted compile without verified executor must be blocked
    expect(() =>
      validatePublicCompilationPolicy({
        untrustedCompileEnabled: true,
        hasVerifiedIsolation: false,
        executorType: "unverified",
      }),
    ).toThrow(PolicyViolationError);
  });
});
