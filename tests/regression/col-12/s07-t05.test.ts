import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  MemoryOfflineStorageProvider,
  OfflineReconnectManager,
} from "../../../apps/web/src/features/collab/offline.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-12 Concurrent offline edit recovery (S07-T05)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("converges offline edits from two concurrently disconnected clients upon reconnect", async () => {
    const fileId = fixture.fileId;

    // Both clients initialize from same base doc
    const baseDoc = new Y.Doc();
    baseDoc.getText("content").insert(0, "% Common Base\n");

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(baseDoc));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(baseDoc));

    const storageA = new MemoryOfflineStorageProvider();
    const storageB = new MemoryOfflineStorageProvider();

    // Client A makes offline edits
    const textA = docA.getText("content");
    textA.insert(textA.length, "Client A offline work.\n");
    const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(baseDoc));
    await storageA.savePendingUpdate(fileId, updateA);

    // Client B makes offline edits
    const textB = docB.getText("content");
    textB.insert(textB.length, "Client B offline work.\n");
    const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(baseDoc));
    await storageB.savePendingUpdate(fileId, updateB);

    // Both clients reconnect to the real CollabServer with fresh tickets
    const ticketA = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const ticketB = await fixture.getTicket(fixture.editor.email, fileId, "write");

    const clientA = await fixture.createClient(ticketA);
    const clientB = await fixture.createClient(ticketB);

    const managerA = new OfflineReconnectManager({
      fileId,
      projectId: fixture.projectId,
      storage: storageA,
      fetchTicket: async () => ticketA,
      sendUpdate: async (u) => {
        await clientA.sendUpdate(u);
      },
    });

    const managerB = new OfflineReconnectManager({
      fileId,
      projectId: fixture.projectId,
      storage: storageB,
      fetchTicket: async () => ticketB,
      sendUpdate: async (u) => {
        await clientB.sendUpdate(u);
      },
    });

    // Listen for peer broadcast
    const bReceivedByA = clientA.waitForMessage((m) => m.type === "sync.update");
    const aReceivedByB = clientB.waitForMessage((m) => m.type === "sync.update");

    // Reconnect and flush both offline buffers
    await Promise.all([managerA.reconnect(), managerB.reconnect()]);

    const msgB = await bReceivedByA;
    const msgA = await aReceivedByB;

    Y.applyUpdate(docA, Buffer.from(msgB.updateBase64, "base64"));
    Y.applyUpdate(docB, Buffer.from(msgA.updateBase64, "base64"));

    // Both clients converged to identical content
    expect(docA.getText("content").toString()).toBe(docB.getText("content").toString());
    expect(docA.getText("content").toString()).toContain("Client A offline work");
    expect(docA.getText("content").toString()).toContain("Client B offline work");

    await clientA.close();
    await clientB.close();
  });
});
