import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../../apps/collab/src/server.js";
import { isStateVectorCovered } from "../../../apps/collab/src/persistence/durable-ack.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-01 Commit-covered durable acknowledgements durability (S07-T11)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("guarantees every acknowledged state vector is present and reconstructed after restart", async () => {
    const ticket1 = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    const client1 = await fixture.createClient(ticket1);

    const clientDoc = new Y.Doc();
    const text = clientDoc.getText("content");
    text.insert(0, "Important thesis paragraph 1.\n");
    const update1 = Y.encodeStateAsUpdate(clientDoc);

    const ack1 = await client1.sendUpdate(update1);
    expect(ack1.type).toBe("text.durable_ack");

    text.insert(text.length, "Important thesis paragraph 2.\n");
    const update2 = Y.encodeStateAsUpdate(clientDoc, Buffer.from(ack1.stateVectorBase64, "base64"));
    const ack2 = await client1.sendUpdate(update2);
    expect(ack2.type).toBe("text.durable_ack");

    // Ack2's state vector must cover clientDoc
    const clientVector = Y.encodeStateVector(clientDoc);
    expect(isStateVectorCovered(ack2.stateVectorBase64, clientVector)).toBe(true);

    await client1.close();

    // Restart collab server
    await fixture.collabServer.stop();

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

    // Connect new client to restarted server
    const ticket2 = await fixture.getTicket(fixture.owner.email, fixture.fileId, "read");
    const client2 = await fixture.createClient(ticket2, {
      serverUrl: `ws://127.0.0.1:${newPort}`,
    });

    const syncMsg = client2.initialSync;
    expect(syncMsg.type).toBe("auth.ok");
    expect(syncMsg.lastPersistedSeq).toBe(ack2.persistedSeq);

    // Verify replayed state vector covers all acknowledged edits
    const restartedDoc = new Y.Doc();
    Y.applyUpdate(restartedDoc, Buffer.from(syncMsg.updateBase64, "base64"));
    expect(restartedDoc.getText("content").toString()).toBe(
      "Important thesis paragraph 1.\nImportant thesis paragraph 2.\n",
    );

    await client2.close();
    await restartedCollabServer.stop();
  });
});
