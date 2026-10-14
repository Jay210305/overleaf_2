import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-03 Role enforcement on collaborative WebSocket rooms (S07-T08)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("enforces VIEWER cannot mutate document content over WSS", async () => {
    const fileId = fixture.fileId;

    const viewerTicket = await fixture.getTicket(fixture.viewer.email, fileId, "read");
    const viewerClient = await fixture.createClient(viewerTicket);

    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Unauthorized viewer text");

    const res = await viewerClient.sendUpdate(Y.encodeStateAsUpdate(doc));
    expect(res.type).toBe("error");
    expect(res.code).toBe("PERMISSION_DENIED");

    await viewerClient.close();
  });

  it("ensures ticket identity cannot override current database ACL", async () => {
    const fileId = fixture.fileId;

    // Issue a write ticket for editor
    const writeTicket = await fixture.getTicket(fixture.editor.email, fileId, "write");

    // Before connecting, demote editor in DB to VIEWER
    await fixture.db.query(
      `UPDATE project_members SET role = 'VIEWER' WHERE project_id = $1 AND user_id = $2`,
      [fixture.projectId, fixture.editor.id],
    );

    // 1. Connecting with the stale write ticket is rejected because live ACL takes precedence
    await expect(fixture.createClient(writeTicket)).rejects.toThrow("PERMISSION_DENIED");

    // 2. Connect with a valid read ticket as VIEWER
    const readTicket = await fixture.getTicket(fixture.editor.email, fileId, "read");
    const client = await fixture.createClient(readTicket);
    expect(client.initialSync.type).toBe("auth.ok");
    expect(client.initialSync.role).toBe("VIEWER");
    expect(client.initialSync.action).toBe("read");

    // Write attempt fails
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Should be rejected");
    const res = await client.sendUpdate(Y.encodeStateAsUpdate(doc));
    expect(res.type).toBe("error");
    expect(res.code).toBe("PERMISSION_DENIED");

    await client.close();
  });
});
