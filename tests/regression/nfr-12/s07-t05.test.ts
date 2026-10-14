import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  MemoryOfflineStorageProvider,
  OfflineReconnectManager,
} from "../../../apps/web/src/features/collab/offline.js";
import { createDurableAck } from "../../../apps/collab/src/persistence/durable-ack.js";

describe("NFR-12 Recoverability of offline writes (S07-T05)", () => {
  it("preserves offline writes without silent discard even if initial reconnect attempts fail", async () => {
    const fileId = "test-nfr-12-file";
    const storage = new MemoryOfflineStorageProvider();

    let attempts = 0;
    let successfulFlushCount = 0;

    const manager = new OfflineReconnectManager({
      fileId,
      projectId: "proj-nfr-12",
      storage,
      fetchTicket: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("Temporary network glitch during ticket acquisition");
        }
        return `ticket-attempt-${attempts}`;
      },
      sendUpdate: async () => {
        successfulFlushCount++;
      },
    });

    // 1. Client goes offline
    manager.setOffline();

    // 2. Client records local edits while offline
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "\\section{Crucial Offline Research}\n");
    const update = Y.encodeStateAsUpdate(doc);
    await manager.recordEdit(doc, update);

    expect(manager.getPendingCount()).toBe(1);

    // Verify written to storage
    const storedBefore = await storage.getPendingUpdates(fileId);
    expect(storedBefore.length).toBe(1);

    // 3. First reconnect attempt fails
    await expect(manager.reconnect()).rejects.toThrow("Temporary network glitch");

    // Edits MUST NOT be discarded on failed reconnect!
    const storedAfterFail = await storage.getPendingUpdates(fileId);
    expect(storedAfterFail.length).toBe(1);
    expect(manager.getPendingCount()).toBe(1);

    // 4. Second reconnect succeeds
    const reconnectResult = await manager.reconnect();
    expect(reconnectResult.flushedCount).toBe(1);
    expect(successfulFlushCount).toBe(1);

    // Edits are still in storage until durable ack arrives
    const storedBeforeAck = await storage.getPendingUpdates(fileId);
    expect(storedBeforeAck.length).toBe(1);

    // 5. Durable ack arrives
    const ack = createDurableAck(fileId, 1, doc);
    const ackCovered = await manager.handleDurableAck(ack);
    expect(ackCovered).toBe(true);
    expect(manager.getStatus()).toBe("saved");

    // Now storage is safely cleared
    const storedAfterAck = await storage.getPendingUpdates(fileId);
    expect(storedAfterAck.length).toBe(0);
  });
});
