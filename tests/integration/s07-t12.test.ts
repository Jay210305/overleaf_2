import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { SnapshotService } from "../../apps/collab/src/persistence/snapshots.js";
import { UpdateLog } from "../../apps/collab/src/persistence/update-log.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T12 Compact verified CRDT snapshots safely integration", () => {
  let fixture: CollabTestFixture;
  let snapshotService: SnapshotService;
  let updateLog: UpdateLog;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
    snapshotService = new SnapshotService(fixture.db);
    updateLog = new UpdateLog(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("compacts updates into a verified snapshot and safely prunes covered updates", async () => {
    const fileId = fixture.fileId;
    const doc = new Y.Doc();

    // Append 5 sequential updates
    for (let i = 1; i <= 5; i++) {
      const stepDoc = new Y.Doc();
      stepDoc.getText("content").insert(0, `Section ${i}\n`);
      const updateBytes = Y.encodeStateAsUpdate(stepDoc);
      await updateLog.appendUpdate(fileId, fixture.owner.id, updateBytes);
      Y.applyUpdate(doc, updateBytes);
    }

    const preCompactionReplay = await updateLog.replay(fileId);

    // Compact up to seq 5 with pruning
    const result = await snapshotService.compact(fileId, {
      pruneCoveredUpdates: true,
    });

    expect(result.snapshotId).toBeDefined();
    expect(result.uptoSeq).toBe(5);
    expect(result.prunedCount).toBeGreaterThanOrEqual(5);

    // Verify covered updates (seq <= 5) are pruned from crdt_updates
    const remainingUpdates = await fixture.db.query<{ count: string }>(
      `SELECT count(*) FROM crdt_updates WHERE file_id = $1 AND seq <= 5`,
      [fileId],
    );
    expect(Number(remainingUpdates.rows[0]?.count)).toBe(0);

    // Replay after compaction must yield identical text and hash
    const postCompactionReplay = await updateLog.replay(fileId);
    expect(postCompactionReplay.text).toBe(preCompactionReplay.text);
    expect(postCompactionReplay.contentSha256).toBe(preCompactionReplay.contentSha256);
  });

  it("applies incremental updates seamlessly on top of a compacted snapshot", async () => {
    const fileId = fixture.fileId;

    // Append a new update (seq 6) after snapshot compaction
    const newDoc = new Y.Doc();
    newDoc.getText("content").insert(0, "\\subsection{Post-compaction increment}\n");
    const updateBytes = Y.encodeStateAsUpdate(newDoc);
    const appendRes = await updateLog.appendUpdate(fileId, fixture.editor.id, updateBytes);
    expect(appendRes.seq).toBe(6);

    // Replay should combine snapshot (seq 1..5) + incremental update (seq 6)
    const replayed = await updateLog.replay(fileId);
    expect(replayed.lastPersistedSeq).toBe(6);
    expect(replayed.text).toContain("Post-compaction increment");
    expect(replayed.text).toContain("Section 1");
  });
});
