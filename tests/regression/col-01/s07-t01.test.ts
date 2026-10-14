import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-01 Concurrent editing room convergence (S07-T01)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("converges concurrent text edits from two clients without loss", async () => {
    const ownerTicket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    const editorTicket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");

    const clientA = await fixture.createClient(ownerTicket);
    const clientB = await fixture.createClient(editorTicket);

    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Client A inserts text
    const textA = docA.getText("content");
    textA.insert(0, "Alpha ");
    const updateA = Y.encodeStateAsUpdate(docA);

    // Client B inserts text
    const textB = docB.getText("content");
    textB.insert(0, "Beta ");
    const updateB = Y.encodeStateAsUpdate(docB);

    // Listen for peer updates
    const updateBReceivedByA = clientA.waitForMessage(
      (m) => m.type === "sync.update" && m.updateBase64,
    );
    const updateAReceivedByB = clientB.waitForMessage(
      (m) => m.type === "sync.update" && m.updateBase64,
    );

    // Send both updates concurrently
    const [ackA, ackB] = await Promise.all([
      clientA.sendUpdate(updateA),
      clientB.sendUpdate(updateB),
    ]);

    expect(ackA.type).toBe("text.durable_ack");
    expect(ackB.type).toBe("text.durable_ack");

    const msgBtoA = await updateBReceivedByA;
    const msgAtoB = await updateAReceivedByB;

    // Apply received updates to respective docs
    Y.applyUpdate(docA, Buffer.from(msgBtoA.updateBase64, "base64"));
    Y.applyUpdate(docB, Buffer.from(msgAtoB.updateBase64, "base64"));

    // Verify both docs converged to identical content
    expect(docA.getText("content").toString()).toBe(docB.getText("content").toString());
    expect(docA.getText("content").toString()).toContain("Alpha");
    expect(docA.getText("content").toString()).toContain("Beta");

    await clientA.close();
    await clientB.close();
  });
});
