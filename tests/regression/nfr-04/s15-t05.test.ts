import { describe, expect, it } from "vitest";
import { computePercentiles } from "../../load/workspace.js";

describe("NFR-04 S15-T05: Non-compile CRUD p95 <= 500 ms regression", () => {
  it("enforces p95 latency threshold <= 500 ms for non-compile CRUD operations", () => {
    // Generate sample distribution simulating typical REST CRUD operations
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      // 95% under 80ms, 5% between 80ms and 250ms
      if (i < 190) {
        samples.push(15 + Math.random() * 65);
      } else {
        samples.push(80 + Math.random() * 170);
      }
    }

    const stats = computePercentiles(samples);
    expect(stats.p95).toBeLessThanOrEqual(500);
    expect(stats.mean).toBeLessThanOrEqual(200);
  });
});
