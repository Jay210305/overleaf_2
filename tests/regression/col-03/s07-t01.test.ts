import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-03 Role enforcement in collaboration rooms (S07-T01)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("enforces that VIEWER receives auth.ok with role VIEWER and action read", async () => {
    const viewerTicket = await fixture.getTicket(fixture.viewer.email, fixture.fileId, "read");
    const client = await fixture.createClient(viewerTicket);

    expect(client.initialSync.role).toBe("VIEWER");
    expect(client.initialSync.action).toBe("read");

    await client.close();
  });

  it("strictly denies VIEWER from requesting a write ticket over REST", async () => {
    await expect(
      fixture.getTicket(fixture.viewer.email, fixture.fileId, "write"),
    ).rejects.toThrow(/403/);
  });

  it("strictly denies VIEWER mutation frames over WSS socket", async () => {
    const viewerTicket = await fixture.getTicket(fixture.viewer.email, fixture.fileId, "read");
    const client = await fixture.createClient(viewerTicket);

    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Unauthorized write attempt");
    const update = Y.encodeStateAsUpdate(doc);

    const errPromise = client.waitForMessage((m) => m.type === "error");
    client.ws.send(
      JSON.stringify({
        type: "sync.update",
        updateBase64: Buffer.from(update).toString("base64"),
      }),
    );

    const err = await errPromise;
    expect(err.code).toBe("PERMISSION_DENIED");

    await client.close();
  });
});
