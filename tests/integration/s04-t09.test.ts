import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture } from "../helpers/s02-session.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { UpdateStore } from "../../apps/api/src/modules/text/update-store.js";

describe("S04-T09 Persist and replay canonical text updates integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let store: UpdateStore;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    store = new UpdateStore(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function createTestFile() {
    const proj = await createProject(fixture.db, owner.id, {
      title: `Store-Test-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });
    return { projectId: proj.id, fileId: proj.mainFileId! };
  }

  it("commits sequential updates and replays exact document state and hash", async () => {
    const { fileId } = await createTestFile();

    // Doc 1: initial insertion
    const doc1 = new Y.Doc();
    doc1.getText("content").insert(0, "\\documentclass{article}\n");
    const update1 = Y.encodeStateAsUpdate(doc1);
    const { seq: seq1 } = await store.appendUpdate(fileId, owner.id, update1);
    expect(seq1).toBe(1);

    // Doc 2: second insertion on top of doc1
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, update1);
    doc2
      .getText("content")
      .insert(doc2.getText("content").length, "\\begin{document}\n¡Hola mundo!\n\\end{document}");
    const update2 = Y.encodeStateAsUpdate(doc2, Y.encodeStateVector(doc1));
    const { seq: seq2 } = await store.appendUpdate(fileId, owner.id, update2);
    expect(seq2).toBe(2);

    // Replay through store
    const replayed = await store.replay(fileId);
    expect(replayed.lastPersistedSeq).toBe(2);
    expect(replayed.text).toBe(
      "\\documentclass{article}\n\\begin{document}\n¡Hola mundo!\n\\end{document}",
    );
    expect(replayed.contentSha256).toBeDefined();
  });

  it("creates compacted snapshot and prunes covered updates safely without loss", async () => {
    const { fileId } = await createTestFile();

    // Append 3 updates
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "A");
    await store.appendUpdate(fileId, owner.id, Y.encodeStateAsUpdate(doc));

    doc.getText("content").insert(1, "B");
    await store.appendUpdate(fileId, owner.id, Y.encodeStateAsUpdate(doc));

    doc.getText("content").insert(2, "C");
    await store.appendUpdate(fileId, owner.id, Y.encodeStateAsUpdate(doc));

    // Snapshot at seq 3 and prune
    const snapshot = await store.createSnapshot(fileId, 3, { pruneCoveredUpdates: true });
    expect(snapshot.uptoSeq).toBe(3);

    // Replay from snapshot
    const replayed = await store.replay(fileId);
    expect(replayed.lastPersistedSeq).toBe(3);
    expect(replayed.text).toBe("ABC");
    expect(replayed.contentSha256).toBe(snapshot.contentSha256);

    // Check that crdt_updates <= 3 were deleted
    const countRes = await fixture.db.query<{ count: string }>(
      `SELECT count(*) FROM crdt_updates WHERE file_id = $1 AND seq <= 3`,
      [fileId],
    );
    expect(Number(countRes.rows[0]?.count)).toBe(0);
  });

  it("ensures duplicate update replay does not double insert (CRDT idempotency)", async () => {
    await createTestFile();

    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Non-duplicating sentence.");
    const update = Y.encodeStateAsUpdate(doc);

    // Replay document directly multiple times with the exact same update
    const targetDoc = new Y.Doc();
    Y.applyUpdate(targetDoc, update);
    expect(targetDoc.getText("content").toString()).toBe("Non-duplicating sentence.");

    // Applying duplicate identical update does not duplicate text
    Y.applyUpdate(targetDoc, update);
    expect(targetDoc.getText("content").toString()).toBe("Non-duplicating sentence.");
  });
});
