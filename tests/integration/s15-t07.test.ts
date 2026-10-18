import { describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import {
  evaluateAlertTriggers,
  sanitizeTelemetryPayload,
  scanLogForLeakage,
} from "../../apps/api/src/plugins/telemetry.js";

describe("S15-T07: Privacy-preserving telemetry and alerts integration", () => {
  it("propagates x-request-id and x-trace-id across HTTP requests and responses", async () => {
    const app = createServer({ checkReadiness: async () => true, logger: false });

    const customTraceId = "trace-custom-uuid-12345";
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health/live",
      headers: {
        "x-trace-id": customTraceId,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-trace-id"]).toBe(customTraceId);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.json().requestId).toBe(res.headers["x-request-id"]);

    await app.close();
  });

  it("sanitizes telemetry payload and redacts sensitive manuscript and credential properties", () => {
    const rawPayload = {
      projectId: "proj-123",
      content: "\\section{Confidential Manuscript} Secret research data",
      token: "jwt.secret.token.here",
      password: "SuperSecretPassword123",
      cookie: "session=xyz123",
      metadata: {
        source: "Top secret source code",
        lineCount: 42,
      },
    };

    const sanitized = sanitizeTelemetryPayload(rawPayload) as Record<string, unknown> & {
      metadata: Record<string, unknown>;
    };

    expect(sanitized.projectId).toBe("proj-123");
    expect(sanitized.content).toBe("[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.cookie).toBe("[REDACTED]");
    expect(sanitized.metadata.source).toBe("[REDACTED]");
    expect(sanitized.metadata.lineCount).toBe(42);

    // Verify privacy scan asserts zero leakage
    const scan = scanLogForLeakage(sanitized, [
      "Confidential Manuscript",
      "jwt.secret.token.here",
      "SuperSecretPassword123",
    ]);
    expect(scan.safe).toBe(true);
    expect(scan.violations).toHaveLength(0);
  });

  it("evaluates reproducible alert triggers for queue lag, queue depth, backup health, and error rate", () => {
    // Normal healthy metrics
    const healthyEvaluation = evaluateAlertTriggers({
      queueLagMs: 250,
      queueDepth: 5,
      lastBackupSuccess: true,
      errorRatePercent: 0.5,
    });
    expect(healthyEvaluation.healthy).toBe(true);
    expect(healthyEvaluation.alerts).toHaveLength(0);

    // High lag and backup failure
    const unhealthyEvaluation = evaluateAlertTriggers({
      queueLagMs: 6500, // > 5000ms
      queueDepth: 75, // > 50
      lastBackupSuccess: false,
      errorRatePercent: 7.2, // > 5%
    });

    expect(unhealthyEvaluation.healthy).toBe(false);
    expect(unhealthyEvaluation.alerts.map((a) => a.code)).toEqual([
      "QUEUE_LAG_HIGH",
      "QUEUE_DEPTH_EXCEEDED",
      "BACKUP_UNHEALTHY",
      "ERROR_RATE_ELEVATED",
    ]);
  });
});
