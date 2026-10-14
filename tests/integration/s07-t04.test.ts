import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { UpdateLog } from "../../apps/collab/src/persistence/update-log.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T04 Append durable CRDT updates integration", () => {
  let fixture: CollabTestFixture;
  let updateLog: UpdateLog;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
    updateLog = new UpdateLog(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("allocates strictly monotonic sequence numbers under concurrent append operations", async () => {
    const concurrency = 10;
    const updates: Uint8Array[] = [];

    for (let i = 0; i < concurrency; i++) {
      const stepDoc = new Y.Doc();
      const stepText = stepDoc.getText("content");
      stepText.insert(0, `Line ${i}\n`);
      updates.push(Y.encodeStateAsUpdate(stepDoc));
    }

    // Execute concurrent appends under PG row lock
    const appendPromises = updates.map((updateBytes) =>
      updateLog.appendUpdate(fixture.fileId, fixture.owner.id, updateBytes),
    );

    const results = await Promise.all(appendPromises);
    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);

    // Assert strictly increasing with step 1
    for (let i = 0; i < seqs.length; i++) {
      if (i > 0) {
        expect(seqs[i]).toBe(seqs[i - 1]! + 1);
      }
    }

    // Check DB text_documents table matches highest seq
    const docRes = await fixture.db.query<{ last_persisted_seq: number }>(
      `SELECT last_persisted_seq FROM text_documents WHERE file_id = $1`,
      [fixture.fileId],
    );
    expect(Number(docRes.rows[0]?.last_persisted_seq)).toBe(seqs[seqs.length - 1]);
  });

  it("replays updates and converges duplicate and out-of-order updates identically", async () => {
    const fileId = fixture.fileId;
    const replayResult = await updateLog.replay(fileId);

    expect(replayResult.doc).toBeDefined();
    expect(replayResult.lastPersistedSeq).toBeGreaterThan(0);
    expect(replayResult.contentSha256).toBeDefined();

    // Now simulate replaying updates in random order on a fresh Y.Doc
    const allUpdates = await fixture.db.query<{ seq: number; payload_bytes: Buffer }>(
      `SELECT seq, payload_bytes FROM crdt_updates WHERE file_id = $1 ORDER BY seq ASC`,
      [fileId],
    );

    const freshDoc = new Y.Doc();
    // Apply in reverse order + with duplicate applications
    const reversed = [...allUpdates.rows].reverse();
    for (const row of reversed) {
      Y.applyUpdate(freshDoc, new Uint8Array(row.payload_bytes));
      // Apply duplicate
      Y.applyUpdate(freshDoc, new Uint8Array(row.payload_bytes));
    }

    // Yjs commutativity and idempotency guarantees exact same text content
    expect(freshDoc.getText("content").toString()).toBe(replayResult.text);
  });
});
