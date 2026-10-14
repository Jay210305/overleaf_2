import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../../apps/collab/src/server.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-01 Zero acknowledged edits lost after server restart (S07-T04)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("recovers all acknowledged edits after a controlled server shutdown and restart", async () => {
    // 1. Client connects to server 1
    const ticket1 = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    const client1 = await fixture.createClient(ticket1);

    const doc1 = new Y.Doc();
    const text1 = doc1.getText("content");
    text1.insert(0, "\\documentclass{article}\n\\begin{document}\nDurable content\n\\end{document}\n");

    const updateBytes = Y.encodeStateAsUpdate(doc1);
    const ack = await client1.sendUpdate(updateBytes);
    expect(ack.type).toBe("text.durable_ack");
    expect(ack.persistedSeq).toBeGreaterThan(0);

    await client1.close();

    // 2. Controlled server shutdown
    await fixture.collabServer.stop();

    // 3. Start a new CollabServer instance (simulating restart)
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

    // 4. Connect client to restarted server
    const ticket2 = await fixture.getTicket(fixture.owner.email, fixture.fileId, "read");
    const client2 = await fixture.createClient(ticket2, {
      serverUrl: `ws://127.0.0.1:${newPort}`,
    });

    // 5. Verify reconstructed document in initialSync has the exact acknowledged edits
    const syncMsg = client2.initialSync;
    expect(syncMsg.type).toBe("auth.ok");
    expect(syncMsg.updateBase64).toBeDefined();

    const recoveredDoc = new Y.Doc();
    Y.applyUpdate(recoveredDoc, Buffer.from(syncMsg.updateBase64, "base64"));
    expect(recoveredDoc.getText("content").toString()).toContain("Durable content");
    expect(recoveredDoc.getText("content").toString()).toContain("\\documentclass{article}");

    await client2.close();
    await restartedCollabServer.stop();
  });
});
