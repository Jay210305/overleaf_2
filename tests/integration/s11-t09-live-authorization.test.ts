import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { createCollabTestFixture } from "../helpers/collab-fixture.js";

function update(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText("content").insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

describe("S11-T09 live WebSocket authorization", () => {
  it("rejects a write after an editor is demoted without relying on a revocation event", async () => {
    const fixture = await createCollabTestFixture();
    try {
      const ticket = await fixture.getTicket(fixture.editor.email, fixture.fileId);
      const client = await fixture.createClient(ticket);
      const before = await fixture.db.query<{ total: string }>(
        "SELECT COUNT(*)::text AS total FROM crdt_updates WHERE file_id = $1",
        [fixture.fileId],
      );
      await fixture.db.query(
        "UPDATE project_members SET role = 'VIEWER' WHERE project_id = $1 AND user_id = $2",
        [fixture.projectId, fixture.editor.id],
      );
      const closed = new Promise<number>((resolve) => client.ws.once("close", resolve));
      const response = await client.sendUpdate(update("must not persist"));
      expect(response).toMatchObject({ type: "error", code: "PERMISSION_DENIED" });
      expect(await closed).toBe(1012);
      const after = await fixture.db.query<{ total: string }>(
        "SELECT COUNT(*)::text AS total FROM crdt_updates WHERE file_id = $1",
        [fixture.fileId],
      );
      expect(after.rows[0]?.total).toBe(before.rows[0]?.total);
      await client.close();
    } finally {
      await fixture.close();
    }
  });

  it("closes a removed member before broadcasting manuscript source", async () => {
    const fixture = await createCollabTestFixture();
    try {
      const editor = await fixture.createClient(
        await fixture.getTicket(fixture.editor.email, fixture.fileId),
      );
      const owner = await fixture.createClient(
        await fixture.getTicket(fixture.owner.email, fixture.fileId),
      );
      const received: string[] = [];
      editor.ws.on("message", (raw) => received.push(raw.toString()));
      const closed = new Promise<number>((resolve) => editor.ws.once("close", resolve));
      await fixture.db.query(
        "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
        [fixture.projectId, fixture.editor.id],
      );
      const ack = await owner.sendUpdate(update("private peer text"));
      expect(ack.type).toBe("text.durable_ack");
      expect(await closed).toBe(4403);
      expect(received.some((raw) => raw.includes("sync.update"))).toBe(false);
      await owner.close();
    } finally {
      await fixture.close();
    }
  });

  it("rejects a write after the connected session is revoked", async () => {
    const fixture = await createCollabTestFixture();
    try {
      const client = await fixture.createClient(
        await fixture.getTicket(fixture.editor.email, fixture.fileId),
      );
      const room = fixture.collabServer.getRoom(
        `project:${fixture.projectId}:file:${fixture.fileId}`,
      );
      const sessionId = [...(room?.clients ?? [])].find(
        (peer) => peer.auth?.userId === fixture.editor.id,
      )?.auth?.sessionId;
      expect(sessionId).toBeDefined();
      await fixture.db.query("UPDATE sessions SET revoked_at = NOW() WHERE id = $1", [sessionId]);
      const response = await client.sendUpdate(update("revoked source"));
      expect(response).toMatchObject({ type: "error", code: "PERMISSION_DENIED" });
      await client.close();
    } finally {
      await fixture.close();
    }
  });
});
