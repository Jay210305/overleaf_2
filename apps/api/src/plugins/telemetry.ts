import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface AlertEvaluation {
  alerts: Array<{
    severity: "warning" | "critical";
    code: string;
    message: string;
    metricValue: number | boolean;
    threshold: number | boolean;
  }>;
  healthy: boolean;
}

export interface MetricSnapshot {
  queueLagMs: number;
  queueDepth: number;
  lastBackupSuccess: boolean;
  errorRatePercent: number;
}

export const ALERT_THRESHOLDS = {
  QUEUE_LAG_MS: 5000,
  QUEUE_DEPTH: 50,
  ERROR_RATE_PERCENT: 5.0,
};

export function evaluateAlertTriggers(metrics: MetricSnapshot): AlertEvaluation {
  const alerts: AlertEvaluation["alerts"] = [];

  if (metrics.queueLagMs > ALERT_THRESHOLDS.QUEUE_LAG_MS) {
    alerts.push({
      severity: "warning",
      code: "QUEUE_LAG_HIGH",
      message: `Compile/job queue lag of ${metrics.queueLagMs}ms exceeds threshold of ${ALERT_THRESHOLDS.QUEUE_LAG_MS}ms`,
      metricValue: metrics.queueLagMs,
      threshold: ALERT_THRESHOLDS.QUEUE_LAG_MS,
    });
  }

  if (metrics.queueDepth > ALERT_THRESHOLDS.QUEUE_DEPTH) {
    alerts.push({
      severity: "critical",
      code: "QUEUE_DEPTH_EXCEEDED",
      message: `Compile queue depth of ${metrics.queueDepth} exceeds threshold of ${ALERT_THRESHOLDS.QUEUE_DEPTH}`,
      metricValue: metrics.queueDepth,
      threshold: ALERT_THRESHOLDS.QUEUE_DEPTH,
    });
  }

  if (!metrics.lastBackupSuccess) {
    alerts.push({
      severity: "critical",
      code: "BACKUP_UNHEALTHY",
      message: "Most recent automated backup job failed or did not verify integrity",
      metricValue: false,
      threshold: true,
    });
  }

  if (metrics.errorRatePercent > ALERT_THRESHOLDS.ERROR_RATE_PERCENT) {
    alerts.push({
      severity: "warning",
      code: "ERROR_RATE_ELEVATED",
      message: `API HTTP 5xx error rate of ${metrics.errorRatePercent}% exceeds threshold of ${ALERT_THRESHOLDS.ERROR_RATE_PERCENT}%`,
      metricValue: metrics.errorRatePercent,
      threshold: ALERT_THRESHOLDS.ERROR_RATE_PERCENT,
    });
  }

  return {
    alerts,
    healthy: alerts.length === 0,
  };
}

const SENSITIVE_KEY_REGEX = /^(password|token|secret|authorization|cookie|csrf|content|source|manuscript|body|payload)$/i;

export function sanitizeTelemetryPayload(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeTelemetryPayload(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeTelemetryPayload(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function scanLogForLeakage(
  logEntry: unknown,
  sensitiveValues: string[],
): { safe: boolean; violations: string[] } {
  const serialized = typeof logEntry === "string" ? logEntry : JSON.stringify(logEntry);
  const violations: string[] = [];

  for (const sensitive of sensitiveValues) {
    if (sensitive && sensitive.length >= 6 && serialized.includes(sensitive)) {
      violations.push(sensitive);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

export function installTelemetryHooks(app: FastifyInstance): void {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const incomingReqId = request.headers["x-request-id"] || request.headers["x-trace-id"];
    const traceId = Array.isArray(incomingReqId) ? incomingReqId[0] : incomingReqId || randomUUID();

    Object.defineProperty(request, "id", { value: traceId, configurable: true, writable: true });
    reply.header("x-request-id", traceId);
    reply.header("x-trace-id", traceId);
  });
}
