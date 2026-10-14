import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../../apps/collab/src/server.js";
import {
  MemoryOfflineStorageProvider,
  OfflineReconnectManager,
} from "../../../apps/web/src/features/collab/offline.js";
import { createDurableAck } from "../../../apps/collab/src/persistence/durable-ack.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-12 Offline writes recovery after server crash and restart (S07-T10)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("safely recovers offline writes after prolonged server downtime and crash", async () => {
    const fileId = fixture.fileId;
    const storage = new MemoryOfflineStorageProvider();

    // 1. Initial setup
    const ticket1 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    let client = await fixture.createClient(ticket1);

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
        await client.sendUpdate(u);
      },
    });

    // 2. Server crashes / stops
    await client.close();
    await fixture.collabServer.stop();
    manager.setOffline();

    // 3. User makes multiple offline edits during downtime
    text.insert(0, "\\section{Offline Section A}\n");
    await manager.recordEdit(doc, Y.encodeStateAsUpdate(doc));

    text.insert(text.length, "\\subsection{Offline Subsection B}\n");
    await manager.recordEdit(doc, Y.encodeStateAsUpdate(doc));

    expect(manager.getPendingCount()).toBe(2);
    expect(manager.getStatus()).toBe("offline");

    // 4. Server restarts on a new port
    const newHttpServer = http.createServer();
    await new Promise<void>((resolve) => newHttpServer.listen(0, () => resolve()));
    const newPort = (newHttpServer.address() as { port: number }).port;

    const restartedCollabServer = new CollabServer({
      server: newHttpServer,
      allowedOrigin: fixture.sessionFixture.origin,
      db: fixture.db,
      ticketStore: fixture.ticketStore,
    });
    await restartedCollabServer.start();

    // 5. Client reconnects to restarted server
    const freshTicket = await fixture.getTicket(fixture.owner.email, fileId, "write");
    client = await fixture.createClient(freshTicket, {
      serverUrl: `ws://127.0.0.1:${newPort}`,
    });

    const flushed = await manager.reconnect();
    expect(flushed.flushedCount).toBe(2);

    // 6. Acknowledge with server state vector
    const ack = createDurableAck(fileId, 5, doc);
    const ackResult = await manager.handleDurableAck(ack);
    expect(ackResult).toBe(true);
    expect(manager.getStatus()).toBe("saved");
    expect(manager.getPendingCount()).toBe(0);

    // Storage is cleanly purged
    const remaining = await storage.getPendingUpdates(fileId);
    expect(remaining.length).toBe(0);

    await client.close();
    await restartedCollabServer.stop();
  });
});
