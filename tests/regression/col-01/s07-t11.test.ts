import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { isStateVectorCovered } from "../../../apps/collab/src/persistence/durable-ack.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-01 Commit-covered durable acknowledgements under concurrent edits (S07-T11)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("issues durable acks covering both concurrent editors without lost confirmed text", async () => {
    const ownerTicket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    const editorTicket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");

    const clientA = await fixture.createClient(ownerTicket);
    const clientB = await fixture.createClient(editorTicket);

    const docA = new Y.Doc();
    const docB = new Y.Doc();

    docA.getText("content").insert(0, "Alice text\n");
    docB.getText("content").insert(0, "Bob text\n");

    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);

    // Send both updates concurrently
    const [ackA, ackB] = await Promise.all([
      clientA.sendUpdate(updateA),
      clientB.sendUpdate(updateB),
    ]);

    expect(ackA.type).toBe("text.durable_ack");
    expect(ackB.type).toBe("text.durable_ack");
    expect(ackA.persistedSeq).toBeGreaterThan(0);
    expect(ackB.persistedSeq).toBeGreaterThan(0);
    expect(ackA.persistedSeq).not.toBe(ackB.persistedSeq); // Strictly monotonic sequences

    // The later ack covers both client updates
    const laterAck = ackA.persistedSeq > ackB.persistedSeq ? ackA : ackB;
    expect(isStateVectorCovered(laterAck.stateVectorBase64, Y.encodeStateVector(docA))).toBe(true);
    expect(isStateVectorCovered(laterAck.stateVectorBase64, Y.encodeStateVector(docB))).toBe(true);

    await clientA.close();
    await clientB.close();
  });
});
