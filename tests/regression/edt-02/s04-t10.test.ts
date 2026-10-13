import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";

describe("EDT-02 S04-T10 REST route rejects racing overwrite and returns 409", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("returns 409 REVISION_CONFLICT on racing concurrent PUT request", async () => {
    const proj = await createProject(fixture.db, owner.id, {
      title: "EDT-02-REST-Race",
      compiler: "pdflatex",
    });
    const fileId = proj.mainFileId!;

    const loginRes = await fixture.login(owner.email);
    const cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(loginRes.headers["x-csrf-token"]);

    // Read base state
    const readRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${proj.id}/files/${fileId}/text`,
      headers: { origin, cookie },
    });
    const baseState = readRes.json();

    // Client 1 commits first
    const doc1 = new Y.Doc();
    doc1.getText("content").insert(0, "First commit");
    const u1 = Y.encodeStateAsUpdate(doc1, Buffer.from(baseState.stateVectorBase64, "base64"));
    const put1 = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${proj.id}/files/${fileId}/text`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        updateBase64: Buffer.from(u1).toString("base64"),
        baseStateVectorBase64: baseState.stateVectorBase64,
      },
    });
    expect(put1.statusCode).toBe(200);

    // Client 2 attempts stale overwrite with original baseState
    const doc2 = new Y.Doc();
    doc2.getText("content").insert(0, "Second racing commit");
    const u2 = Y.encodeStateAsUpdate(doc2, Buffer.from(baseState.stateVectorBase64, "base64"));
    const put2 = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${proj.id}/files/${fileId}/text`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        updateBase64: Buffer.from(u2).toString("base64"),
        baseStateVectorBase64: baseState.stateVectorBase64,
      },
    });

    expect(put2.statusCode).toBe(409);
    expect(put2.json().code).toBe("REVISION_CONFLICT");
  });
});
