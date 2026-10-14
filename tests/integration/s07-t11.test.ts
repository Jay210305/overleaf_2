import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  createDurableAck,
  isStateVectorCovered,
  ClientSaveTracker,
} from "../../apps/collab/src/persistence/durable-ack.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T11 Commit-covered durable acknowledgements integration", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("creates durable ack with committed state vector covering the document", () => {
    const doc = new Y.Doc();
    const text = doc.getText("content");
    text.insert(0, "First edit");

    const ack = createDurableAck("test-file-id", 42, doc);
    expect(ack.type).toBe("text.durable_ack");
    expect(ack.version).toBe(1);
    expect(ack.fileId).toBe("test-file-id");
    expect(ack.persistedSeq).toBe(42);
    expect(typeof ack.stateVectorBase64).toBe("string");

    const isCovered = isStateVectorCovered(ack.stateVectorBase64, Y.encodeStateVector(doc));
    expect(isCovered).toBe(true);
  });

  it("detects when server state vector does not yet cover pending client clocks", () => {
    const serverDoc = new Y.Doc();
    const clientDoc = new Y.Doc();

    // Client makes an edit
    const clientText = clientDoc.getText("content");
    clientText.insert(0, "Local uncommitted edit");

    const serverVector = Y.encodeStateVector(serverDoc);
    const clientVector = Y.encodeStateVector(clientDoc);

    // Server does not yet cover client's edit
    expect(isStateVectorCovered(serverVector, clientVector)).toBe(false);

    // Apply client update to server
    const clientUpdate = Y.encodeStateAsUpdate(clientDoc);
    Y.applyUpdate(serverDoc, clientUpdate);

    // Now server vector covers client vector
    const updatedServerVector = Y.encodeStateVector(serverDoc);
    expect(isStateVectorCovered(updatedServerVector, clientVector)).toBe(true);
  });

  it("tracks save status accurately in ClientSaveTracker across multiple edits", () => {
    const statuses: string[] = [];
    const tracker = new ClientSaveTracker((s) => statuses.push(s));
    expect(tracker.getStatus()).toBe("saved");

    const clientDoc = new Y.Doc();
    const text = clientDoc.getText("content");

    // Edit 1
    text.insert(0, "Edit 1 ");
    tracker.recordLocalEdit(clientDoc);
    expect(tracker.getStatus()).toBe("saving");
    expect(tracker.getPendingCount()).toBe(1);

    // Edit 2 before ACK 1 arrives
    text.insert(text.length, "Edit 2 ");
    tracker.recordLocalEdit(clientDoc);
    expect(tracker.getStatus()).toBe("saving");
    expect(tracker.getPendingCount()).toBe(2);

    // Create partial server doc that only has Edit 1
    // Simulate server covering only edit 1
    const edit1Doc = new Y.Doc();
    edit1Doc.getText("content").insert(0, "Edit 1 ");

    const partialAck = createDurableAck("test-file", 1, edit1Doc);
    tracker.handleDurableAck(partialAck);
    // Still saving because Edit 2 is pending
    expect(tracker.getStatus()).toBe("saving");

    // Full server doc covering both edits
    const fullAck = createDurableAck("test-file", 2, clientDoc);
    tracker.handleDurableAck(fullAck);
    expect(tracker.getStatus()).toBe("saved");
    expect(tracker.getPendingCount()).toBe(0);
  });

  it("receives durable ack over real WebSocket only after DB persistence", async () => {
    const ticket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    const client = await fixture.createClient(ticket);

    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Acked edit");
    const update = Y.encodeStateAsUpdate(doc);

    const ack = await client.sendUpdate(update);
    expect(ack.type).toBe("text.durable_ack");
    expect(ack.fileId).toBe(fixture.fileId);
    expect(ack.persistedSeq).toBeGreaterThan(0);

    // Verify DB has this sequence persisted
    const dbRes = await fixture.db.query<{ last_persisted_seq: number }>(
      `SELECT last_persisted_seq FROM text_documents WHERE file_id = $1`,
      [fixture.fileId],
    );
    expect(Number(dbRes.rows[0]?.last_persisted_seq)).toBe(ack.persistedSeq);

    await client.close();
  });
});
