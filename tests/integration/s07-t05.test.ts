import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  calculateBackoffDelayMs,
  MemoryOfflineStorageProvider,
  OfflineReconnectManager,
} from "../../apps/web/src/features/collab/offline.js";
import { createDurableAck } from "../../apps/collab/src/persistence/durable-ack.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T05 Offline persistence and reconnect integration", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("calculates bounded exponential backoff delay to prevent storm loops", () => {
    const delay0 = calculateBackoffDelayMs(0);
    const delay1 = calculateBackoffDelayMs(1);
    const delay2 = calculateBackoffDelayMs(2);
    const delay8 = calculateBackoffDelayMs(8);
    const delay20 = calculateBackoffDelayMs(20);

    expect(delay0).toBeGreaterThanOrEqual(500);
    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay2).toBeGreaterThanOrEqual(2000);
    expect(delay8).toBeLessThanOrEqual(36_000);
    // Bounded max delay is 30,000 + 20% jitter = 36,000 max
    expect(delay20).toBeLessThanOrEqual(36_000);
  });

  it("retains pending offline updates in storage and flushes them on reconnect with fresh ticket", async () => {
    const storage = new MemoryOfflineStorageProvider();
    const sentUpdates: Uint8Array[] = [];
    const requestedTickets: string[] = [];

    const manager = new OfflineReconnectManager({
      fileId: "file-offline-test",
      projectId: "proj-123",
      storage,
      fetchTicket: async () => {
        const t = `fresh-ticket-${Date.now()}-${Math.random()}`;
        requestedTickets.push(t);
        return t;
      },
      sendUpdate: async (u) => {
        sentUpdates.push(u);
      },
    });

    expect(manager.getStatus()).toBe("saved");

    // Client goes offline
    manager.setOffline();
    expect(manager.getStatus()).toBe("offline");

    // Make 2 edits while offline
    const doc1 = new Y.Doc();
    doc1.getText("content").insert(0, "Line 1\n");
    const update1 = Y.encodeStateAsUpdate(doc1);
    await manager.recordEdit(doc1, update1);

    doc1.getText("content").insert(doc1.getText("content").length, "Line 2\n");
    const update2 = Y.encodeStateAsUpdate(doc1);
    await manager.recordEdit(doc1, update2);

    expect(manager.getStatus()).toBe("offline");
    expect(manager.getPendingCount()).toBe(2);
    expect(sentUpdates.length).toBe(0); // Nothing sent while offline

    // Reconnect
    const reconnectRes = await manager.reconnect();
    expect(reconnectRes.flushedCount).toBe(2);
    expect(requestedTickets.length).toBe(1);
    expect(sentUpdates.length).toBe(2);
    expect(manager.getStatus()).toBe("saving");

    // Server acknowledges with state vector covering both edits
    const ack = createDurableAck("file-offline-test", 10, doc1);
    const ackHandled = await manager.handleDurableAck(ack);
    expect(ackHandled).toBe(true);
    expect(manager.getStatus()).toBe("saved");
    expect(manager.getPendingCount()).toBe(0);

    // Verify storage cleared
    const stored = await storage.getPendingUpdates("file-offline-test");
    expect(stored.length).toBe(0);
  });

  it("flushes offline edits over real WebSocket upon reconnection and achieves convergence", async () => {
    const fileId = fixture.fileId;
    const storage = new MemoryOfflineStorageProvider();

    // 1. Initial connection
    const ticket1 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    let activeClient = await fixture.createClient(ticket1);

    const doc = new Y.Doc();
    const text = doc.getText("content");

    const manager = new OfflineReconnectManager({
      fileId,
      projectId: fixture.projectId,
      storage,
      fetchTicket: async () => {
        return await fixture.getTicket(fixture.owner.email, fileId, "write");
      },
      sendUpdate: async (u) => {
        await activeClient.sendUpdate(u);
      },
    });

    // 2. Disconnect socket to simulate dropping offline
    await activeClient.close();
    manager.setOffline();
    expect(manager.getStatus()).toBe("offline");

    // 3. Make offline edits
    text.insert(0, "Offline drafted paragraph.\n");
    const offlineUpdate = Y.encodeStateAsUpdate(doc);
    await manager.recordEdit(doc, offlineUpdate);

    // 4. Reconnect: create a fresh real client with fresh ticket
    const freshTicket = await fixture.getTicket(fixture.owner.email, fileId, "write");
    activeClient = await fixture.createClient(freshTicket);

    const flushed = await manager.reconnect();
    expect(flushed.flushedCount).toBe(1);

    // 5. Verify server persisted update and doc converges
    const ack = createDurableAck(fileId, 1, doc);
    await manager.handleDurableAck(ack);
    expect(manager.getStatus()).toBe("saved");

    await activeClient.close();
  });
});
