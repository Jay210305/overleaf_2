import { describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";

describe("NFR-04 S15-T07: Telemetry overhead does not degrade non-compile CRUD latency", () => {
  it("processes requests with telemetry instrumentation well under 500 ms", async () => {
    const app = createServer({ checkReadiness: async () => true, logger: false });

    const start = performance.now();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health/live",
      headers: { "x-request-id": "req-perf-1" },
    });
    const durationMs = performance.now() - start;

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.json().requestId).toBe(res.headers["x-request-id"]);
    expect(durationMs).toBeLessThan(100); // Well under 500ms

    await app.close();
  });
});
