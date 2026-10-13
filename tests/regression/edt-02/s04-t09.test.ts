import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import { UpdateStore } from "../../../apps/api/src/modules/text/update-store.js";

describe("EDT-02 S04-T09 Replay consistency and monotonic sequence ordering", () => {
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

  it("strictly enforces ascending monotonic sequence without overwriting or skipping", async () => {
    const proj = await createProject(fixture.db, owner.id, {
      title: "EDT-02-Store-Test",
      compiler: "pdflatex",
    });
    const fileId = proj.mainFileId!;

    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Line 1\n");
    const res1 = await store.appendUpdate(fileId, owner.id, Y.encodeStateAsUpdate(doc));
    expect(res1.seq).toBe(1);

    doc.getText("content").insert(doc.getText("content").length, "Line 2\n");
    const res2 = await store.appendUpdate(fileId, owner.id, Y.encodeStateAsUpdate(doc));
    expect(res2.seq).toBe(2);

    const replayed = await store.replay(fileId);
    expect(replayed.lastPersistedSeq).toBe(2);
    expect(replayed.text).toBe("Line 1\nLine 2\n");
  });
});
