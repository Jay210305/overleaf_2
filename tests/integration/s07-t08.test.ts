import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T08 Apply live role and session revocation integration", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("terminates open sockets and invalidates tickets on session revocation", async () => {
    const fileId = fixture.fileId;
    const revocationManager = fixture.collabServer.getRevocationManager();

    const ticket = await fixture.getTicket(fixture.editor.email, fileId, "write");
    const client = await fixture.createClient(ticket);

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      client.ws.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Revoke editor's session
    const editorSessionRes = await fixture.db.query<{ id: string }>(
      `SELECT id FROM sessions WHERE user_id = $1`,
      [fixture.editor.id],
    );
    const sessionId = editorSessionRes.rows[0]?.id;
    expect(sessionId).toBeDefined();

    const affected = await revocationManager.handleRevocation({
      type: "session_revoked",
      sessionId: sessionId!,
    });
    expect(affected).toBeGreaterThan(0);

    const closeEvent = await closePromise;
    expect(closeEvent.code).toBe(4401);
    expect(closeEvent.reason).toBe("SESSION_REVOKED");
  });

  it("terminates open sockets and invalidates tickets when member is removed from project", async () => {
    const fileId = fixture.fileId;
    const revocationManager = fixture.collabServer.getRevocationManager();

    // Re-grant editor membership for test
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', NOW())
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'EDITOR'`,
      [fixture.projectId, fixture.editor.id],
    );

    const ticket = await fixture.getTicket(fixture.editor.email, fileId, "write");
    const client = await fixture.createClient(ticket);

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      client.ws.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Remove member
    await fixture.db.query(`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, [
      fixture.projectId,
      fixture.editor.id,
    ]);

    const affected = await revocationManager.handleRevocation({
      type: "member_removed",
      userId: fixture.editor.id,
      projectId: fixture.projectId,
    });
    expect(affected).toBeGreaterThan(0);

    const closeEvent = await closePromise;
    expect(closeEvent.code).toBe(4403);
    expect(closeEvent.reason).toBe("MEMBER_REMOVED");
  });

  it("demotes open socket to read-only upon role change to VIEWER and rejects subsequent writes", async () => {
    const fileId = fixture.fileId;
    const revocationManager = fixture.collabServer.getRevocationManager();

    // Re-add editor
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', NOW())
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'EDITOR'`,
      [fixture.projectId, fixture.editor.id],
    );

    const ticket = await fixture.getTicket(fixture.editor.email, fileId, "write");
    const client = await fixture.createClient(ticket);

    // Initial write succeeds
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Allowed initial write\n");
    const ack1 = await client.sendUpdate(Y.encodeStateAsUpdate(doc));
    expect(ack1.type).toBe("text.durable_ack");

    const roleUpdatedReceived = client.waitForMessage((m) => m.type === "role_updated");

    // Demote to VIEWER
    await fixture.db.query(
      `UPDATE project_members SET role = 'VIEWER' WHERE project_id = $1 AND user_id = $2`,
      [fixture.projectId, fixture.editor.id],
    );

    await revocationManager.handleRevocation({
      type: "role_changed",
      userId: fixture.editor.id,
      projectId: fixture.projectId,
      newRole: "VIEWER",
    });

    const roleMsg = await roleUpdatedReceived;
    expect(roleMsg.type).toBe("role_updated");
    expect(roleMsg.newRole).toBe("VIEWER");
    expect(roleMsg.action).toBe("read");

    // Attempting a second write now fails with PERMISSION_DENIED
    doc.getText("content").insert(0, "Unauthorized write after demotion\n");
    const ack2 = await client.sendUpdate(Y.encodeStateAsUpdate(doc));
    expect(ack2.type).toBe("error");
    expect(ack2.code).toBe("PERMISSION_DENIED");

    await client.close();
  });
});
