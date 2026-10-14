import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("PRO-04 Tree mutation propagation to collaboration rooms (S07-T06)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("propagates rename mutations while keeping room active and rejects post-delete writes", async () => {
    const fileId = fixture.fileId;
    const synchronizer = fixture.collabServer.getTreeSynchronizer();

    const ticket = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client = await fixture.createClient(ticket);

    // 1. Rename event occurs
    synchronizer.handleEvent({
      eventId: "evt-move-pro04",
      projectId: fixture.projectId,
      type: "file.moved",
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: {
        nodeId: fileId,
        newPath: "chapters/intro.tex",
        treeVersion: 10,
      },
    });

    expect(synchronizer.getFilePath(fileId)).toBe("chapters/intro.tex");
    expect(synchronizer.isFileDeleted(fileId)).toBe(false);

    // 2. Delete event occurs
    const closePromise = new Promise<{ code: number }>((resolve) => {
      client.ws.once("close", (code) => resolve({ code }));
    });

    synchronizer.handleEvent({
      eventId: "evt-delete-pro04",
      projectId: fixture.projectId,
      type: "file.deleted",
      version: 1,
      occurredAt: new Date().toISOString(),
      payload: {
        nodeId: fileId,
        treeVersion: 11,
      },
    });

    const closeInfo = await closePromise;
    expect(closeInfo.code).toBe(4404);
    expect(synchronizer.isFileDeleted(fileId)).toBe(true);

    // 3. Attempting to get a ticket or connect to the deleted file is rejected
    const s = await fixture.sessionFixture.login(fixture.owner.email);
    const cookie = String(s.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(s.headers["x-csrf-token"]);

    // If file is deleted, getting a ticket or room should fail
    // Delete file from DB project_nodes to simulate real deletion
    await fixture.db.query(`UPDATE project_nodes SET deleted_at = NOW() WHERE id = $1`, [fileId]);

    const ticketRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${fixture.projectId}/collab-ticket`,
      headers: {
        origin: fixture.sessionFixture.origin,
        cookie,
        "x-csrf-token": csrf,
      },
      payload: {
        fileId,
        action: "write",
      },
    });
    expect(ticketRes.statusCode).toBe(404);
  });
});
