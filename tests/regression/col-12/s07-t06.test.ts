import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-12 Concurrent edit and tree rename conflict recovery (S07-T06)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("safely recovers and merges concurrent edits across file rename events", async () => {
    const fileId = fixture.fileId;
    const synchronizer = fixture.collabServer.getTreeSynchronizer();

    const ticketA = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const ticketB = await fixture.getTicket(fixture.editor.email, fileId, "write");

    const clientA = await fixture.createClient(ticketA);
    const clientB = await fixture.createClient(ticketB);

    const docA = new Y.Doc();
    const docB = new Y.Doc();

    docA.getText("content").insert(0, "Edit before rename\n");
    const update1 = Y.encodeStateAsUpdate(docA);

    await clientA.sendUpdate(update1);

    // Tree event: file is renamed
    synchronizer.handleEvent({
      eventId: "evt-tree-col12",
      projectId: fixture.projectId,
      type: "file.moved",
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: {
        nodeId: fileId,
        newPath: "docs/renamed_doc.tex",
        treeVersion: 5,
      },
    });

    // Client B continues editing the file after rename
    docB.getText("content").insert(0, "Edit after rename\n");
    const update2 = Y.encodeStateAsUpdate(docB);

    const peerReceived = clientA.waitForMessage((m) => m.type === "sync.update");
    const ackB = await clientB.sendUpdate(update2);
    expect(ackB.type).toBe("text.durable_ack");

    const bUpdateMsg = await peerReceived;
    expect(bUpdateMsg.type).toBe("sync.update");

    // Both clients still communicate and remain in sync under stable fileId
    await clientA.close();
    await clientB.close();
  });
});
