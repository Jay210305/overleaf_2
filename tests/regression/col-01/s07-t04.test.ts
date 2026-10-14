import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { UpdateLog } from "../../../apps/collab/src/persistence/update-log.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-01 Concurrent editing update log persistence (S07-T04)", () => {
  let fixture: CollabTestFixture;
  let updateLog: UpdateLog;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
    updateLog = new UpdateLog(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("persists concurrent updates and reconstructs exact merged state on replay", async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, "% Header\n");
    const initUpdate = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, initUpdate);

    // Save initial update
    await updateLog.appendUpdate(fixture.fileId, fixture.owner.id, initUpdate);

    // Client A and B make concurrent edits
    textA.insert(textA.length, "\\section{A}\n");
    const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));

    textB.insert(textB.length, "\\section{B}\n");
    const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));

    // Persist both concurrent updates
    await Promise.all([
      updateLog.appendUpdate(fixture.fileId, fixture.owner.id, updateA),
      updateLog.appendUpdate(fixture.fileId, fixture.editor.id, updateB),
    ]);

    // Cross-apply in memory
    Y.applyUpdate(docA, updateB);
    Y.applyUpdate(docB, updateA);

    expect(textA.toString()).toBe(textB.toString());

    // Replay from DB on a completely fresh doc
    const replayed = await updateLog.replay(fixture.fileId);
    expect(replayed.text).toBe(textA.toString());
    expect(replayed.text).toContain("\\section{A}\n");
    expect(replayed.text).toContain("\\section{B}\n");
  });
});
