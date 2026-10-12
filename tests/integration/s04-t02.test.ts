import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture } from "../helpers/s02-session.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { DefaultTextDocumentService } from "../../apps/api/src/modules/text/text-document-service.js";

describe("S04-T02 Canonical text document service integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editorUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };
  let outsider: { id: string; email: string };
  let service: DefaultTextDocumentService;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editorUser = await fixture.seed();
    viewerUser = await fixture.seed();
    outsider = await fixture.seed();
    service = new DefaultTextDocumentService(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function createTestProject() {
    const proj = await createProject(fixture.db, owner.id, {
      title: `Project-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });

    // Add editor and viewer members
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', NOW()), ($1, $3, 'VIEWER', NOW())`,
      [proj.id, editorUser.id, viewerUser.id],
    );

    return { projectId: proj.id, fileId: proj.mainFileId! };
  }

  it("loads and initializes canonical text state with seq 0", async () => {
    const { projectId, fileId } = await createTestProject();

    const state = await service.load(projectId, fileId, owner.id);
    expect(state.fileId).toBe(fileId);
    expect(state.persistedSeq).toBe(0);
    expect(state.updateBase64).toBeDefined();
    expect(state.stateVectorBase64).toBeDefined();

    const content = await service.getTextContent(projectId, fileId, owner.id);
    expect(content).toBe("");
  });

  it("applies client Yjs update and advances monotonic sequence", async () => {
    const { projectId, fileId } = await createTestProject();

    const initial = await service.load(projectId, fileId, owner.id);

    // Create client Y.Doc, apply initial server state, and make an edit
    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, Buffer.from(initial.updateBase64, "base64"));
    const ytext = clientDoc.getText("content");
    ytext.insert(0, "\\documentclass{article}\n\\begin{document}\n¡Hola mundo! 🌟\n\\end{document}");

    // Compute update diff relative to server's state vector
    const serverVector = Buffer.from(initial.stateVectorBase64, "base64");
    const clientUpdate = Y.encodeStateAsUpdate(clientDoc, serverVector);

    const applied = await service.apply(projectId, fileId, editorUser.id, {
      updateBase64: Buffer.from(clientUpdate).toString("base64"),
      baseStateVectorBase64: initial.stateVectorBase64,
    });

    expect(applied.persistedSeq).toBe(1);

    const recovered = await service.getTextContent(projectId, fileId, owner.id);
    expect(recovered).toBe(
      "\\documentclass{article}\n\\begin{document}\n¡Hola mundo! 🌟\n\\end{document}",
    );
  });

  it("recovers identical text after cold API restart with zero divergence", async () => {
    const { projectId, fileId } = await createTestProject();

    const initial = await service.load(projectId, fileId, owner.id);
    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, Buffer.from(initial.updateBase64, "base64"));
    clientDoc.getText("content").insert(0, "Unicode testing: α + β = γ. Ñandú.");

    const clientUpdate = Y.encodeStateAsUpdate(
      clientDoc,
      Buffer.from(initial.stateVectorBase64, "base64"),
    );
    await service.apply(projectId, fileId, owner.id, {
      updateBase64: Buffer.from(clientUpdate).toString("base64"),
      baseStateVectorBase64: initial.stateVectorBase64,
    });

    // Simulate API restart with brand new service instance
    const restartedService = new DefaultTextDocumentService(fixture.db);
    const reloaded = await restartedService.load(projectId, fileId, owner.id);
    expect(reloaded.persistedSeq).toBe(1);

    const recoveredText = await restartedService.getTextContent(projectId, fileId, owner.id);
    expect(recoveredText).toBe("Unicode testing: α + β = γ. Ñandú.");
  });

  it("detects stale base state vector and returns 409 REVISION_CONFLICT", async () => {
    const { projectId, fileId } = await createTestProject();

    const initial = await service.load(projectId, fileId, owner.id);

    // First commit
    const doc1 = new Y.Doc();
    Y.applyUpdate(doc1, Buffer.from(initial.updateBase64, "base64"));
    doc1.getText("content").insert(0, "Edit 1");
    const update1 = Y.encodeStateAsUpdate(
      doc1,
      Buffer.from(initial.stateVectorBase64, "base64"),
    );
    await service.apply(projectId, fileId, owner.id, {
      updateBase64: Buffer.from(update1).toString("base64"),
      baseStateVectorBase64: initial.stateVectorBase64,
    });

    // Stale concurrent commit that still uses initial baseStateVector
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, Buffer.from(initial.updateBase64, "base64"));
    doc2.getText("content").insert(0, "Racing Edit 2");
    const update2 = Y.encodeStateAsUpdate(
      doc2,
      Buffer.from(initial.stateVectorBase64, "base64"),
    );

    // Stale base vector must throw 409
    await expect(
      service.apply(projectId, fileId, editorUser.id, {
        updateBase64: Buffer.from(update2).toString("base64"),
        baseStateVectorBase64: initial.stateVectorBase64,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVISION_CONFLICT",
    });

    // Original text is safe and unchanged
    const currentText = await service.getTextContent(projectId, fileId, owner.id);
    expect(currentText).toBe("Edit 1");
  });

  it("denies VIEWER write attempts with 403 and outsider access with 404", async () => {
    const { projectId, fileId } = await createTestProject();
    const initial = await service.load(projectId, fileId, owner.id);

    // VIEWER attempt to write -> 403
    await expect(
      service.apply(projectId, fileId, viewerUser.id, {
        updateBase64: initial.updateBase64,
        baseStateVectorBase64: initial.stateVectorBase64,
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "PROJECT_PERMISSION_DENIED",
    });

    // Outsider attempt to load -> 404
    await expect(service.load(projectId, fileId, outsider.id)).rejects.toMatchObject({
      status: 404,
      code: "RESOURCE_NOT_FOUND",
    });
  });
});
