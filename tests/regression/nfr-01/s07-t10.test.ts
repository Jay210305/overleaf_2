import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../../apps/collab/src/server.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-01 Zero acknowledged edits lost after restart failure recovery (S07-T10)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("recovers 100% of acknowledged updates with zero data loss after abrupt server stop", async () => {
    const fileId = fixture.fileId;
    const ticket = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client = await fixture.createClient(ticket);

    const doc = new Y.Doc();
    const text = doc.getText("content");

    // Write a series of 10 rapid edits with durable ACKs
    for (let i = 1; i <= 10; i++) {
      text.insert(text.length, `Item ${i}: Verified durable.\n`);
      const ack = await client.sendUpdate(Y.encodeStateAsUpdate(doc));
      expect(ack.type).toBe("text.durable_ack");
    }

    const expectedText = text.toString();
    await client.close();

    // Abrupt server stop
    await fixture.collabServer.stop();

    // Bring up restarted server
    const newHttpServer = http.createServer();
    await new Promise<void>((resolve) => newHttpServer.listen(0, () => resolve()));
    const newPort = (newHttpServer.address() as { port: number }).port;

    const restartedCollabServer = new CollabServer({
      server: newHttpServer,
      allowedOrigin: fixture.sessionFixture.origin,
      db: fixture.db,
      ticketStore: fixture.ticketStore,
    });
    await restartedCollabServer.start();

    // Connect to restarted server
    const ticket2 = await fixture.getTicket(fixture.owner.email, fileId, "read");
    const client2 = await fixture.createClient(ticket2, {
      serverUrl: `ws://127.0.0.1:${newPort}`,
    });

    const recoveredDoc = new Y.Doc();
    Y.applyUpdate(recoveredDoc, Buffer.from(client2.initialSync.updateBase64, "base64"));

    expect(recoveredDoc.getText("content").toString()).toBe(expectedText);

    await client2.close();
    await restartedCollabServer.stop();
  });
});
