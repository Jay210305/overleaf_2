import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  ClientSaveTracker,
  createDurableAck,
} from "../../../apps/collab/src/persistence/durable-ack.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("EDT-02 Save status display and racing overwrite rejection (S07-T11)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("transitions between saved, saving, offline, and error accurately", () => {
    const tracker = new ClientSaveTracker();
    expect(tracker.getStatus()).toBe("saved");

    const doc = new Y.Doc();
    doc.getText("content").insert(0, "typing...");

    // Local edit transitions to saving
    tracker.recordLocalEdit(doc);
    expect(tracker.getStatus()).toBe("saving");

    // Network drops -> transitions to offline
    tracker.setOnline(false);
    expect(tracker.getStatus()).toBe("offline");

    // Network restores -> transitions back to saving because local edits are pending
    tracker.setOnline(true);
    expect(tracker.getStatus()).toBe("saving");

    // Server error / DB outage -> transitions to error
    tracker.setError();
    expect(tracker.getStatus()).toBe("error");

    // Durable ACK arrives covering edit -> transitions to saved
    const ack = createDurableAck("test-file", 1, doc);
    tracker.handleDurableAck(ack);
    expect(tracker.getStatus()).toBe("saved");
  });

  it("ensures broadcast receipt alone cannot produce a saved acknowledgement without commit", async () => {
    const ownerTicket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    const editorTicket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");

    const authorClient = await fixture.createClient(ownerTicket);
    const peerClient = await fixture.createClient(editorTicket);

    const peerTracker = new ClientSaveTracker();
    const peerDoc = new Y.Doc();
    // Peer records local edit
    peerDoc.getText("content").insert(0, "Peer local text");
    peerTracker.recordLocalEdit(peerDoc);
    expect(peerTracker.getStatus()).toBe("saving");

    // Author client sends an update
    const authorDoc = new Y.Doc();
    authorDoc.getText("content").insert(0, "Author text");
    const authorUpdate = Y.encodeStateAsUpdate(authorDoc);

    const peerReceivedUpdate = peerClient.waitForMessage((m) => m.type === "sync.update");
    await authorClient.sendUpdate(authorUpdate);

    const peerMsg = await peerReceivedUpdate;
    expect(peerMsg.type).toBe("sync.update");

    // Peer must NOT mark its local edits as saved on broadcast receipt
    const handled = peerTracker.handleDurableAck(peerMsg);
    expect(handled).toBe(false);
    expect(peerTracker.getStatus()).toBe("saving"); // Still saving!

    await authorClient.close();
    await peerClient.close();
  });
});
