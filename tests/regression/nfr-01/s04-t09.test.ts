import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import { UpdateStore } from "../../../apps/api/src/modules/text/update-store.js";

describe("NFR-01 S04-T09 Full state recovery from snapshot and uncompacted updates", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("reconstructs exact document state across snapshot plus delta updates", async () => {
    const proj = await createProject(fixture.db, owner.id, {
      title: "NFR-01-Delta-Test",
      compiler: "pdflatex",
    });
    const fileId = proj.mainFileId!;
    const store = new UpdateStore(fixture.db);

    // Initial state: doc with chapters
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "\\chapter{Uno}\nTexto inicial.\n");
    await store.appendUpdate(fileId, owner.id, Y.encodeStateAsUpdate(doc));

    // Create snapshot at seq 1
    const snap = await store.createSnapshot(fileId, 1);
    expect(snap.uptoSeq).toBe(1);

    // Append updates after snapshot (seq 2 and 3)
    doc
      .getText("content")
      .insert(doc.getText("content").length, "\\chapter{Dos}\nTexto adicional.\n");
    await store.appendUpdate(fileId, owner.id, Y.encodeStateAsUpdate(doc));

    doc.getText("content").insert(doc.getText("content").length, "Fin del documento.");
    await store.appendUpdate(fileId, owner.id, Y.encodeStateAsUpdate(doc));

    // Simulate cold restart by replaying with a fresh store instance
    const freshStore = new UpdateStore(fixture.db);
    const replayed = await freshStore.replay(fileId);

    expect(replayed.lastPersistedSeq).toBe(3);
    expect(replayed.text).toBe(
      "\\chapter{Uno}\nTexto inicial.\n\\chapter{Dos}\nTexto adicional.\nFin del documento.",
    );
  });
});
