import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { SnapshotService } from "../../../apps/collab/src/persistence/snapshots.js";
import { UpdateLog } from "../../../apps/collab/src/persistence/update-log.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-01 Safe compaction under concurrent editing (S07-T12)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("compacts prior history while concurrent incoming updates arrive and converge", async () => {
    const updateLog = new UpdateLog(fixture.db);
    const snapshotService = new SnapshotService(fixture.db);

    // Initial base content
    const baseDoc = new Y.Doc();
    baseDoc.getText("content").insert(0, "% Base\n");
    const { seq: seq1 } = await updateLog.appendUpdate(
      fixture.fileId,
      fixture.owner.id,
      Y.encodeStateAsUpdate(baseDoc),
    );

    // Compact history up to seq1
    const compactResult = await snapshotService.compact(fixture.fileId, {
      uptoSeq: seq1,
      pruneCoveredUpdates: true,
    });
    expect(compactResult.uptoSeq).toBe(seq1);

    // Concurrent edits from two clients on top of the snapshot
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Replay state into docA and docB
    const replayBase = await updateLog.replay(fixture.fileId);
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(replayBase.doc));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(replayBase.doc));

    docA.getText("content").insert(docA.getText("content").length, "Alice concurrent edit\n");
    docB.getText("content").insert(docB.getText("content").length, "Bob concurrent edit\n");

    const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));

    await Promise.all([
      updateLog.appendUpdate(fixture.fileId, fixture.owner.id, updateA),
      updateLog.appendUpdate(fixture.fileId, fixture.editor.id, updateB),
    ]);

    // Cross-merge
    Y.applyUpdate(docA, updateB);
    Y.applyUpdate(docB, updateA);

    expect(docA.getText("content").toString()).toBe(docB.getText("content").toString());

    // Replay from DB combines snapshot + remaining updates and matches merged doc exactly
    const finalReplay = await updateLog.replay(fixture.fileId);
    expect(finalReplay.text).toBe(docA.getText("content").toString());
    expect(finalReplay.text).toContain("Alice concurrent edit");
    expect(finalReplay.text).toContain("Bob concurrent edit");
  });
});
