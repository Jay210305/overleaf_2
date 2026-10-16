import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import {
  TextSaveCoordinator,
  type SaveTransport,
} from "../../apps/web/src/features/editor/persistence.js";
import type { ApplyTextUpdateInput, DurableAck } from "@latex-collab/contracts";

describe("S04-T03 Save status, retries and persistence coordinator integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editorUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editorUser = await fixture.seed();
    viewerUser = await fixture.seed();
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
      title: `SaveCoord-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', NOW()), ($1, $3, 'VIEWER', NOW())`,
      [proj.id, editorUser.id, viewerUser.id],
    );

    return { projectId: proj.id, fileId: proj.mainFileId! };
  }

  function makeTransport(cookie: string, csrf: string): SaveTransport {
    return {
      async save(projectId: string, fileId: string, input: ApplyTextUpdateInput) {
        const res = await fixture.app.inject({
          method: "PUT",
          url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
          headers: {
            origin,
            cookie,
            "x-csrf-token": csrf,
            "content-type": "application/json",
          },
          payload: input,
        });

        if (res.statusCode !== 200) {
          const err = res.json();
          const errorObj = {
            status: res.statusCode,
            code: err.code || err.title,
            message: err.detail || `HTTP ${res.statusCode}`,
          };
          throw errorObj;
        }

        return res.json() as { ack: DurableAck };
      },
    };
  }

  it("Save status reaches saved only after committed coverage (no false saved)", async () => {
    const { projectId, fileId } = await setupProject();
    const session = await getSession(editorUser.email);

    // Initial load
    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: session.cookie },
    });
    const state = getRes.json();

    const statusHistory: string[] = [];
    const coordinator = new TextSaveCoordinator({
      projectId,
      fileId,
      transport: makeTransport(session.cookie, session.csrf),
      onStatusChange: (s) => statusHistory.push(s),
    });

    expect(coordinator.getStatus()).toBe("saved");

    // Create an edit
    const clientDoc = new Y.Doc();
    Y.applyUpdate(clientDoc, Buffer.from(state.updateBase64, "base64"));
    const clientText = clientDoc.getText("content");
    clientText.insert(0, "% New header line\n");

    const update = Y.encodeStateAsUpdate(clientDoc);
    const updateB64 = Buffer.from(update).toString("base64");

    // Local / uncommitted write starts saving, never claimed saved prematurely
    const savePromise = coordinator.enqueue(updateB64, state.stateVectorBase64);
    expect(coordinator.getStatus()).toBe("saving");

    const ack = await savePromise;
    expect(ack.type).toBe("text.durable_ack");
    expect(ack.persistedSeq).toBe(1);
    expect(coordinator.getStatus()).toBe("saved");
    expect(statusHistory).toContain("saving");
    expect(statusHistory[statusHistory.length - 1]).toBe("saved");

    coordinator.destroy();
  });

  it("Local/IndexedDB/socket-only write cannot be reported server-saved without DurableAck", async () => {
    let mockServerAcknowledged = false;
    const fakeTransport: SaveTransport = {
      async save() {
        // Simulates delayed or hanging server persistence
        await new Promise((r) => setTimeout(r, 50));
        mockServerAcknowledged = true;
        return {
          ack: {
            type: "text.durable_ack",
            version: 1,
            fileId: "dummy-file",
            persistedSeq: 1,
            stateVectorBase64: "",
          },
        };
      },
    };

    const coordinator = new TextSaveCoordinator({
      projectId: "proj-1",
      fileId: "dummy-file",
      transport: fakeTransport,
    });

    // Enqueue write
    const promise = coordinator.enqueue("update", "vector");
    // Immediately after enqueue (local write done), status must NOT be saved!
    expect(coordinator.getStatus()).not.toBe("saved");
    expect(coordinator.getStatus()).toBe("saving");
    expect(mockServerAcknowledged).toBe(false);

    await promise;
    expect(mockServerAcknowledged).toBe(true);
    expect(coordinator.getStatus()).toBe("saved");
    coordinator.destroy();
  });

  it("Fails with 403 for viewer, transitions to error without reporting saved", async () => {
    const { projectId, fileId } = await setupProject();
    const session = await getSession(viewerUser.email); // VIEWER role

    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: session.cookie },
    });
    const state = getRes.json();

    const coordinator = new TextSaveCoordinator({
      projectId,
      fileId,
      transport: makeTransport(session.cookie, session.csrf),
    });

    await expect(
      coordinator.enqueue("dummy-update", state.stateVectorBase64),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    expect(coordinator.getStatus()).toBe("error");
    expect(coordinator.getLastError()?.code).toBe("FORBIDDEN");
    coordinator.destroy();
  });

  it("Fails with 404 for deleted file, transitions to error", async () => {
    const { projectId } = await setupProject();
    const session = await getSession(editorUser.email);
    const nonExistentFileId = randomUUID();

    const coordinator = new TextSaveCoordinator({
      projectId,
      fileId: nonExistentFileId,
      transport: makeTransport(session.cookie, session.csrf),
    });

    const dummyDoc = new Y.Doc();
    const updateB64 = Buffer.from(Y.encodeStateAsUpdate(dummyDoc)).toString("base64");
    const vectorB64 = Buffer.from(Y.encodeStateVector(dummyDoc)).toString("base64");

    await expect(coordinator.enqueue(updateB64, vectorB64)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    expect(coordinator.getStatus()).toBe("error");
    expect(coordinator.getLastError()?.code).toBe("NOT_FOUND");
    coordinator.destroy();
  });

  it("Fails with 409 on stale base vector, rejecting racing overwrite", async () => {
    const { projectId, fileId } = await setupProject();
    const session = await getSession(editorUser.email);

    // Initial load
    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: session.cookie },
    });
    const state = getRes.json();

    // First edit succeeds
    const doc1 = new Y.Doc();
    Y.applyUpdate(doc1, Buffer.from(state.updateBase64, "base64"));
    doc1.getText("content").insert(0, "First edit\n");
    const u1 = Buffer.from(Y.encodeStateAsUpdate(doc1)).toString("base64");

    const coord1 = new TextSaveCoordinator({
      projectId,
      fileId,
      transport: makeTransport(session.cookie, session.csrf),
    });
    await coord1.enqueue(u1, state.stateVectorBase64);
    coord1.destroy();

    // Second edit from a stale client with stale base vector (state.stateVectorBase64)
    const coord2 = new TextSaveCoordinator({
      projectId,
      fileId,
      transport: makeTransport(session.cookie, session.csrf),
    });

    await expect(coord2.enqueue(u1, state.stateVectorBase64)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });

    expect(coord2.getStatus()).toBe("error");
    expect(coord2.getLastError()?.code).toBe("CONFLICT");
    coord2.destroy();
  });

  it("Outage (503 / network) preserves pending text in queue and retries", async () => {
    let callCount = 0;
    const failingTransport: SaveTransport = {
      async save() {
        callCount++;
        if (callCount === 1) {
          throw { status: 503, code: "SERVICE_UNAVAILABLE", message: "Database down" };
        }
        return {
          ack: {
            type: "text.durable_ack",
            version: 1,
            fileId: "retry-file",
            persistedSeq: 1,
            stateVectorBase64: "",
          },
        };
      },
    };

    const coordinator = new TextSaveCoordinator({
      projectId: "proj-1",
      fileId: "retry-file",
      transport: failingTransport,
      initialBackoffMs: 20,
    });

    const promise = coordinator.enqueue("my-pending-text-update", "vector");

    // After failure 1, status is error and queue has pending update
    await new Promise((r) => setTimeout(r, 10));
    expect(coordinator.getStatus()).toBe("error");
    expect(coordinator.getPendingCount()).toBe(1);

    // Wait for backoff retry to succeed
    const ack = await promise;
    expect(ack.persistedSeq).toBe(1);
    expect(coordinator.getStatus()).toBe("saved");
    expect(coordinator.getPendingCount()).toBe(0);
    coordinator.destroy();
  });
});
