export interface DurabilityMetricsSnapshot {
  activeConnections: number;
  activeRooms: number;
  broadcastLagMs: {
    count: number;
    avg: number;
    p95: number;
  };
  persistenceLagMs: {
    count: number;
    avg: number;
    p95: number;
  };
}

export class CollabDurabilityMetrics {
  private activeConnections = 0;
  private activeRooms = 0;
  private broadcastLatencies: number[] = [];
  private persistenceLatencies: number[] = [];
  private maxSamples = 1000;

  recordConnectionOpened(): void {
    this.activeConnections++;
  }

  recordConnectionClosed(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  setRoomCount(count: number): void {
    this.activeRooms = Math.max(0, count);
  }

  recordBroadcastLag(ms: number): void {
    if (ms >= 0 && Number.isFinite(ms)) {
      this.broadcastLatencies.push(ms);
      if (this.broadcastLatencies.length > this.maxSamples) {
        this.broadcastLatencies.shift();
      }
    }
  }

  recordPersistenceLag(ms: number): void {
    if (ms >= 0 && Number.isFinite(ms)) {
      this.persistenceLatencies.push(ms);
      if (this.persistenceLatencies.length > this.maxSamples) {
        this.persistenceLatencies.shift();
      }
    }
  }

  getSnapshot(): DurabilityMetricsSnapshot {
    return {
      activeConnections: this.activeConnections,
      activeRooms: this.activeRooms,
      broadcastLagMs: this.calculateStats(this.broadcastLatencies),
      persistenceLagMs: this.calculateStats(this.persistenceLatencies),
    };
  }

  /**
   * Sanitizes log payload to ensure NFR-10:
   * Strictly strips any ticket tokens, secrets, or manuscript text.
   */
  static sanitizeLogPayload(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const forbiddenKeys = new Set([
      "ticket",
      "token",
      "password",
      "secret",
      "cookie",
      "content",
      "text",
      "payload_bytes",
      "update",
      "updatebase64",
    ]);

    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (forbiddenKeys.has(lower)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = Array.isArray(value)
          ? value.map((item) =>
              typeof item === "object" && item !== null
                ? CollabDurabilityMetrics.sanitizeLogPayload(item as Record<string, unknown>)
                : item,
            )
          : CollabDurabilityMetrics.sanitizeLogPayload(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private calculateStats(samples: number[]): { count: number; avg: number; p95: number } {
    if (samples.length === 0) {
      return { count: 0, avg: 0, p95: 0 };
    }

    const count = samples.length;
    const sum = samples.reduce((acc, val) => acc + val, 0);
    const avg = Math.round((sum / count) * 100) / 100;

    const sorted = [...samples].sort((a, b) => a - b);
    const p95Index = Math.min(Math.floor(count * 0.95), count - 1);
    const p95 = sorted[p95Index] ?? 0;

    return { count, avg, p95 };
  }
}
