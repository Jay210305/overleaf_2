import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import { DefaultTextDocumentService } from "../../../apps/api/src/modules/text/text-document-service.js";

describe("EDT-02 S04-T02 Rejects racing overwrite and preserves consistent text state", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let service: DefaultTextDocumentService;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    service = new DefaultTextDocumentService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("rejects racing overwrite when base state vector is stale", async () => {
    const proj = await createProject(fixture.db, owner.id, {
      title: "Concurrent Test",
      compiler: "pdflatex",
    });
    const projectId = proj.id;
    const fileId = proj.mainFileId!;

    const baseState = await service.load(projectId, fileId, owner.id);

    // Apply Client A update
    const docA = new Y.Doc();
    Y.applyUpdate(docA, Buffer.from(baseState.updateBase64, "base64"));
    docA.getText("content").insert(0, "A won");
    const updateA = Y.encodeStateAsUpdate(docA, Buffer.from(baseState.stateVectorBase64, "base64"));

    await service.apply(projectId, fileId, owner.id, {
      updateBase64: Buffer.from(updateA).toString("base64"),
      baseStateVectorBase64: baseState.stateVectorBase64,
    });

    // Client B attempts to overwrite using stale baseStateVector
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Buffer.from(baseState.updateBase64, "base64"));
    docB.getText("content").insert(0, "B racing");
    const updateB = Y.encodeStateAsUpdate(docB, Buffer.from(baseState.stateVectorBase64, "base64"));

    await expect(
      service.apply(projectId, fileId, owner.id, {
        updateBase64: Buffer.from(updateB).toString("base64"),
        baseStateVectorBase64: baseState.stateVectorBase64,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVISION_CONFLICT",
    });

    const finalContent = await service.getTextContent(projectId, fileId, owner.id);
    expect(finalContent).toBe("A won");
  });
});
