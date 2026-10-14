import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TreeEventSynchronizer } from "../../apps/collab/src/tree-events.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T06 Synchronize tree changes with open rooms integration", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("retains room ID and connection across file rename events", async () => {
    const fileId = fixture.fileId;
    const synchronizer = fixture.collabServer.getTreeSynchronizer();

    // Connect client
    const ticket = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client = await fixture.createClient(ticket);

    // Initial ping
    client.send({ type: "ping" });
    const pong1 = await client.waitForMessage((m) => m.type === "pong");
    expect(pong1.type).toBe("pong");

    // Dispatch file.moved (rename) event
    const res = synchronizer.handleEvent({
      eventId: "evt-rename-1",
      projectId: fixture.projectId,
      type: "file.moved",
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: {
        nodeId: fileId,
        newPath: "renamed_main.tex",
        treeVersion: 2,
      },
    });

    expect(res.roomClosed).toBe(false);
    expect(res.reconcileRequired).toBe(false);
    expect(synchronizer.getFilePath(fileId)).toBe("renamed_main.tex");

    // Client connection remains OPEN and functional
    client.send({ type: "ping" });
    const pong2 = await client.waitForMessage((m) => m.type === "pong");
    expect(pong2.type).toBe("pong");

    await client.close();
  });

  it("closes room and disconnects clients with 4404 when file is deleted", async () => {
    const fileId = fixture.fileId;
    const synchronizer = fixture.collabServer.getTreeSynchronizer();

    // Connect client
    const ticket = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client = await fixture.createClient(ticket);

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      client.ws.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Dispatch file.deleted event
    const res = synchronizer.handleEvent({
      eventId: "evt-delete-1",
      projectId: fixture.projectId,
      type: "file.deleted",
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: {
        nodeId: fileId,
        treeVersion: 3,
      },
    });

    expect(res.roomClosed).toBe(true);
    expect(synchronizer.isFileDeleted(fileId)).toBe(true);

    // Socket was closed by server
    const closeEvent = await closePromise;
    expect(closeEvent.code).toBe(4404);
    expect(closeEvent.reason).toBe("FILE_DELETED");
  });

  it("detects tree version gaps and flags reconciliation requirement for REST refresh", () => {
    const synchronizer = new TreeEventSynchronizer();

    // Event at treeVersion 1
    const res1 = synchronizer.handleEvent({
      eventId: "evt-1",
      projectId: "proj-gap-test",
      type: "file.moved",
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: { nodeId: "f-1", treeVersion: 1 },
    });
    expect(res1.reconcileRequired).toBe(false);

    // Event at treeVersion 4 (gap: missed 2 and 3)
    const res2 = synchronizer.handleEvent({
      eventId: "evt-2",
      projectId: "proj-gap-test",
      type: "file.moved",
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: { nodeId: "f-1", treeVersion: 4 },
    });
    expect(res2.reconcileRequired).toBe(true);
  });
});
