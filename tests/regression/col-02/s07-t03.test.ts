import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";
import { type CollaboratorUser } from "../../../apps/web/src/features/collab/presence.js";

describe("COL-02 Collaborator presence and awareness broadcasting (S07-T03)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("broadcasts user awareness, identity, color, and cursor coordinates to room peers", async () => {
    const ownerTicket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    const editorTicket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");

    const clientA = await fixture.createClient(ownerTicket);
    const clientB = await fixture.createClient(editorTicket);

    const awarenessReceivedByB = clientB.waitForMessage(
      (m) => m.type === "awareness" && m.userId === fixture.owner.id,
    );

    const awarenessPayload = {
      user: {
        id: fixture.owner.id,
        name: "Alice Owner",
        color: "#4f46e5",
      },
      cursor: { line: 14, col: 7 },
      activeFileId: fixture.fileId,
      activeFileName: "main.tex",
    };

    // Client A broadcasts awareness
    clientA.send({
      type: "awareness",
      awareness: awarenessPayload,
    });

    const msg = await awarenessReceivedByB;
    expect(msg.type).toBe("awareness");
    expect(msg.userId).toBe(fixture.owner.id);
    expect(msg.awareness.user.name).toBe("Alice Owner");
    expect(msg.awareness.user.color).toBe("#4f46e5");
    expect(msg.awareness.cursor.line).toBe(14);
    expect(msg.awareness.cursor.col).toBe(7);
    expect(msg.awareness.activeFileName).toBe("main.tex");

    // Map awareness message to CollaboratorUser representation
    const collaborator: CollaboratorUser = {
      id: msg.userId,
      name: msg.awareness.user.name,
      color: msg.awareness.user.color,
      cursor: msg.awareness.cursor,
      activeFileId: msg.awareness.activeFileId,
      activeFileName: msg.awareness.activeFileName,
    };

    expect(collaborator.id).toBe(fixture.owner.id);
    expect(collaborator.cursor?.line).toBe(14);
    expect(collaborator.cursor?.col).toBe(7);

    await clientA.close();
    await clientB.close();
  });
});
