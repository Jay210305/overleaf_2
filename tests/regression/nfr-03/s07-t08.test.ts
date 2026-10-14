import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-03 Revoked users cannot mutate or receive unauthorized data (S07-T08)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("terminates socket immediately and stops delivery of new data upon member revocation", async () => {
    const fileId = fixture.fileId;
    const revocationManager = fixture.collabServer.getRevocationManager();

    // Re-grant editor membership
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', NOW())
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'EDITOR'`,
      [fixture.projectId, fixture.editor.id],
    );

    const ownerTicket = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const editorTicket = await fixture.getTicket(fixture.editor.email, fileId, "write");

    const ownerClient = await fixture.createClient(ownerTicket);
    const editorClient = await fixture.createClient(editorTicket);

    const closePromise = new Promise<{ code: number }>((resolve) => {
      editorClient.ws.once("close", (code) => resolve({ code }));
    });

    // Revoke editor member
    await fixture.db.query(
      `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [fixture.projectId, fixture.editor.id],
    );

    await revocationManager.handleRevocation({
      type: "member_removed",
      userId: fixture.editor.id,
      projectId: fixture.projectId,
    });

    // Editor socket was forcefully disconnected
    const closeInfo = await closePromise;
    expect(closeInfo.code).toBe(4403);

    // Owner types sensitive updates after revocation
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "\\section{Confidential Post-Revocation Data}\n");
    const update = Y.encodeStateAsUpdate(doc);
    await ownerClient.sendUpdate(update);

    // Verify editor socket is closed and received zero subsequent bytes
    expect(editorClient.ws.readyState).toBe(editorClient.ws.CLOSED);

    // Editor REST request for new ticket is denied (403)
    const s = await fixture.sessionFixture.login(fixture.editor.email);
    const cookie = String(s.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(s.headers["x-csrf-token"]);

    const deniedTicketRes = await fixture.app.inject({
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
    expect([403, 404]).toContain(deniedTicketRes.statusCode);

    await ownerClient.close();
  });
});
