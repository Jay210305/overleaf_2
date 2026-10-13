import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";

describe("NFR-01 S04-T08 Zero Unicode acknowledged edits lost across server restart", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("persists and recovers complex multi-byte RTL, Spanish, and emoji glyphs across restart", async () => {
    const loginRes = await fixture.login(owner.email);
    const cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(loginRes.headers["x-csrf-token"]);

    const proj = await createProject(fixture.db, owner.id, {
      title: `NFR01-Unicode-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });

    // 1. Initial GET
    const initRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${proj.id}/files/${proj.mainFileId}/text`,
      headers: { origin, cookie },
    });
    const state = initRes.json();

    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(state.updateBase64, "base64"));
    const complexGlyphs = "ñ, á, é, í, ó, ú, ¿, ¡, 🚀, 🔬, ∇, ∫, ∑, ⊗, שלום, مرحبا";
    doc.getText("content").insert(0, complexGlyphs);

    const updateB64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");

    // 2. Commit update
    const putRes = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${proj.id}/files/${proj.mainFileId}/text`,
      headers: { origin, cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      payload: {
        updateBase64: updateB64,
        baseStateVectorBase64: state.stateVectorBase64,
      },
    });
    expect(putRes.statusCode).toBe(200);

    // 3. Restart server
    await fixture.app.close();
    const restarted = await createSessionFixture();
    const relogin = await restarted.login(owner.email);
    const newCookie = String(relogin.headers["set-cookie"]).split(";")[0]!;

    // 4. Retrieve and verify
    const restoredRes = await restarted.app.inject({
      method: "GET",
      url: `/api/v1/projects/${proj.id}/files/${proj.mainFileId}/text`,
      headers: { origin, cookie: newCookie },
    });
    expect(restoredRes.statusCode).toBe(200);

    const restoredDoc = new Y.Doc();
    Y.applyUpdate(restoredDoc, Buffer.from(restoredRes.json().updateBase64, "base64"));
    expect(restoredDoc.getText("content").toString()).toContain(complexGlyphs);

    await restarted.close();
  });
});
