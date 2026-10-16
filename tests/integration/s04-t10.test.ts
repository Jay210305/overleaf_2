import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";

describe("S04-T10 REST text state-version contract integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editorUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };
  let outsider: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editorUser = await fixture.seed();
    viewerUser = await fixture.seed();
    outsider = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  async function setupProject() {
    const proj = await createProject(fixture.db, owner.id, {
      title: `REST-Text-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', NOW()), ($1, $3, 'VIEWER', NOW())`,
      [proj.id, editorUser.id, viewerUser.id],
    );

    return { projectId: proj.id, fileId: proj.mainFileId! };
  }

  it("GET /api/v1/projects/:projectId/files/:fileId/text reads canonical text state", async () => {
    const { projectId, fileId } = await setupProject();
    const session = await getSession(owner.email);

    const res = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fileId).toBe(fileId);
    expect(body.persistedSeq).toBe(0);
    expect(body.updateBase64).toBeDefined();
    expect(body.stateVectorBase64).toBeDefined();
  });

  it("PUT /api/v1/projects/:projectId/files/:fileId/text commits update and returns DurableAck", async () => {
    const { projectId, fileId } = await setupProject();
    const session = await getSession(editorUser.email);

    // 1. Load initial state
    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });
    const initialState = getRes.json();

    // 2. Prepare client mutation
    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, Buffer.from(initialState.updateBase64, "base64"));
    clientDoc
      .getText("content")
      .insert(0, "\\section{Introducción}\nTexto de prueba en español.\n");

    const updateBytes = Y.encodeStateAsUpdate(
      clientDoc,
      Buffer.from(initialState.stateVectorBase64, "base64"),
    );

    // 3. PUT mutation
    const putRes = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        updateBase64: Buffer.from(updateBytes).toString("base64"),
        baseStateVectorBase64: initialState.stateVectorBase64,
      },
    });

    expect(putRes.statusCode).toBe(200);
    const putBody = putRes.json();
    expect(putBody.persistedSeq).toBe(1);
    expect(putBody.ack).toBeDefined();
    expect(putBody.ack.type).toBe("text.durable_ack");
    expect(putBody.ack.version).toBe(1);
    expect(putBody.ack.fileId).toBe(fileId);
    expect(putBody.ack.persistedSeq).toBe(1);
  });

  it("rejects stale base state vector with 409 REVISION_CONFLICT", async () => {
    const { projectId, fileId } = await setupProject();
    const sessionOwner = await getSession(owner.email);
    const sessionEditor = await getSession(editorUser.email);

    // Initial state
    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: sessionOwner.cookie },
    });
    const initial = getRes.json();

    // First edit succeeds
    const doc1 = new Y.Doc();
    doc1.getText("content").insert(0, "Edit 1");
    const u1 = Y.encodeStateAsUpdate(doc1, Buffer.from(initial.stateVectorBase64, "base64"));
    await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: sessionOwner.cookie,
        "x-csrf-token": sessionOwner.csrf,
      },
      payload: {
        updateBase64: Buffer.from(u1).toString("base64"),
        baseStateVectorBase64: initial.stateVectorBase64,
      },
    });

    // Stale concurrent edit from editor with stale base vector
    const doc2 = new Y.Doc();
    doc2.getText("content").insert(0, "Stale Edit 2");
    const u2 = Y.encodeStateAsUpdate(doc2, Buffer.from(initial.stateVectorBase64, "base64"));
    const staleRes = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: sessionEditor.cookie,
        "x-csrf-token": sessionEditor.csrf,
      },
      payload: {
        updateBase64: Buffer.from(u2).toString("base64"),
        baseStateVectorBase64: initial.stateVectorBase64,
      },
    });

    expect(staleRes.statusCode).toBe(409);
    expect(staleRes.json().code).toBe("REVISION_CONFLICT");
  });

  it("enforces COL-03: VIEWER cannot write text returning 403", async () => {
    const { projectId, fileId } = await setupProject();
    const viewerSession = await getSession(viewerUser.email);

    // VIEWER can read
    const readRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: viewerSession.cookie },
    });
    expect(readRes.statusCode).toBe(200);

    // VIEWER cannot PUT (EDIT action denied)
    const writeRes = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
        "x-csrf-token": viewerSession.csrf,
      },
      payload: {
        updateBase64: readRes.json().updateBase64,
        baseStateVectorBase64: readRes.json().stateVectorBase64,
      },
    });

    expect(writeRes.statusCode).toBe(403);
    expect(writeRes.json().code).toBe("PROJECT_PERMISSION_DENIED");
  });

  it("denies unauthenticated requests with 401 and outsider with 404", async () => {
    const { projectId, fileId } = await setupProject();
    const outsiderSession = await getSession(outsider.email);

    // Unauthenticated
    const unauthRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin },
    });
    expect(unauthRes.statusCode).toBe(401);

    // Outsider (anti-enumeration 404)
    const outsiderRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: outsiderSession.cookie },
    });
    expect(outsiderRes.statusCode).toBe(404);
  });
});
