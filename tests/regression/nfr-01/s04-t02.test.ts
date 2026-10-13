import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import { DefaultTextDocumentService } from "../../../apps/api/src/modules/text/text-document-service.js";

describe("NFR-01 S04-T02 Zero acknowledged edits lost after controlled server restart", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("preserves acknowledged edits across fresh service instantiations", async () => {
    const proj = await createProject(fixture.db, owner.id, {
      title: "NFR-01 Test",
      compiler: "pdflatex",
    });
    const projectId = proj.id;
    const fileId = proj.mainFileId!;

    const service1 = new DefaultTextDocumentService(fixture.db);
    const initial = await service1.load(projectId, fileId, owner.id);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(initial.updateBase64, "base64"));
    const complexLaTeX = `\\documentclass{report}
\\usepackage{amsmath}
% Símbolos especiales en español: año, canción, pingüino
\\title{Demostración de Durabilidad}
\\author{Julio}
\\begin{document}
\\maketitle
El conjunto de números primos es infinito: $|\\mathbb{P}| = \\infty$.
\\end{document}`;

    doc.getText("content").insert(0, complexLaTeX);
    const update = Y.encodeStateAsUpdate(doc, Buffer.from(initial.stateVectorBase64, "base64"));

    const ack = await service1.apply(projectId, fileId, owner.id, {
      updateBase64: Buffer.from(update).toString("base64"),
      baseStateVectorBase64: initial.stateVectorBase64,
    });
    expect(ack.persistedSeq).toBe(1);

    // Simulate complete API restart: destroy service1 and construct service2
    const service2 = new DefaultTextDocumentService(fixture.db);
    const recoveredText = await service2.getTextContent(projectId, fileId, owner.id);
    expect(recoveredText).toBe(complexLaTeX);

    // Ensure state vector is recoverable and compatible
    const reloaded = await service2.load(projectId, fileId, owner.id);
    expect(reloaded.persistedSeq).toBe(1);
    expect(reloaded.stateVectorBase64).toBe(ack.stateVectorBase64);
  });
});
