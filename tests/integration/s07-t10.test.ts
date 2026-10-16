import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../apps/collab/src/server.js";
import { ClientSaveTracker } from "../../apps/collab/src/persistence/durable-ack.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T10 Convergence failures and recovery integration", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("never reports saved during database outage and maintains pending status", async () => {
    const tracker = new ClientSaveTracker();
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Content during outage");

    // Local edit transitions to saving
    tracker.recordLocalEdit(doc);
    expect(tracker.getStatus()).toBe("saving");

    // Database outage occurs
    tracker.setError();
    expect(tracker.getStatus()).toBe("error");

    // Even if random peer broadcast arrives, it is rejected and NEVER marked saved
    const broadcastMsg = {
      type: "sync.update",
      updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    };
    const handled = tracker.handleDurableAck(broadcastMsg);
    expect(handled).toBe(false);
    expect(tracker.getStatus()).toBe("error");
    expect(tracker.getPendingCount()).toBe(1);
  });

  it("recovers all durable-ACK covered edits across disconnect and server restart", async () => {
    const fileId = fixture.fileId;
    const ticket1 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client1 = await fixture.createClient(ticket1);

    const doc = new Y.Doc();
    const text = doc.getText("content");
    text.insert(
      0,
      "\\documentclass{article}\n\\begin{document}\nFault Tolerance Verified\n\\end{document}\n",
    );

    const ack = await client1.sendUpdate(Y.encodeStateAsUpdate(doc));
    expect(ack.type).toBe("text.durable_ack");
    expect(ack.persistedSeq).toBeGreaterThan(0);

    // Force disconnect
    await client1.close();

    // Controlled server restart
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

    // Reconnect new client
    const ticket2 = await fixture.getTicket(fixture.owner.email, fileId, "read");
    const client2 = await fixture.createClient(ticket2, {
      serverUrl: `ws://127.0.0.1:${newPort}`,
    });

    const syncMsg = client2.initialSync;
    expect(syncMsg.type).toBe("auth.ok");
    const recoveredDoc = new Y.Doc();
    Y.applyUpdate(recoveredDoc, Buffer.from(syncMsg.updateBase64, "base64"));
    expect(recoveredDoc.getText("content").toString()).toContain("Fault Tolerance Verified");

    await client2.close();
    await restartedCollabServer.stop();
  });
});
