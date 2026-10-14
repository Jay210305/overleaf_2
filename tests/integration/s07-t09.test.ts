import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CollabDurabilityMetrics } from "../../apps/collab/src/metrics.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T09 Collaborative durability metrics integration", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("calculates p95 and separates broadcast lag from persistence lag", () => {
    const metrics = new CollabDurabilityMetrics();

    // Populate broadcast latencies (fast, e.g. 5-25ms)
    for (let i = 1; i <= 100; i++) {
      metrics.recordBroadcastLag(i % 25);
    }

    // Populate persistence latencies (database commit, e.g. 20-80ms)
    for (let i = 1; i <= 100; i++) {
      metrics.recordPersistenceLag(20 + (i % 60));
    }

    const snapshot = metrics.getSnapshot();
    expect(snapshot.broadcastLagMs.count).toBe(100);
    expect(snapshot.persistenceLagMs.count).toBe(100);

    expect(snapshot.broadcastLagMs.p95).toBeLessThanOrEqual(25);
    expect(snapshot.persistenceLagMs.p95).toBeGreaterThan(snapshot.broadcastLagMs.p95);
  });

  it("sanitizes log payloads to redact manuscript text and authentication tokens", () => {
    const dirtyPayload = {
      event: "update_received",
      roomId: "project:123:file:456",
      ticket: "secret-ticket-token-xyz",
      token: "bearer-token-123",
      text: "\\documentclass{article}\\begin{document}Private manuscript content\\end{document}",
      nested: {
        password: "user-password",
        content: "Draft paper confidential thoughts",
        safeMeta: "version-1",
      },
    };

    const clean = CollabDurabilityMetrics.sanitizeLogPayload(dirtyPayload);
    expect(clean.ticket).toBe("[REDACTED]");
    expect(clean.token).toBe("[REDACTED]");
    const nested = clean.nested as Record<string, unknown>;
    expect(nested.password).toBe("[REDACTED]");
    expect(nested.content).toBe("[REDACTED]");
    expect(nested.safeMeta).toBe("version-1");
  });

  it("records real broadcast lag and persistence lag on live server edits", async () => {
    const fileId = fixture.fileId;
    const ticket = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client = await fixture.createClient(ticket);

    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Live metrics edit\n");
    await client.sendUpdate(Y.encodeStateAsUpdate(doc));

    const metricsSnapshot = fixture.collabServer.getMetrics().getSnapshot();
    expect(metricsSnapshot.broadcastLagMs.count).toBeGreaterThan(0);
    expect(metricsSnapshot.persistenceLagMs.count).toBeGreaterThan(0);
    expect(metricsSnapshot.activeConnections).toBeGreaterThan(0);
    expect(metricsSnapshot.activeRooms).toBeGreaterThan(0);

    await client.close();
  });
});
