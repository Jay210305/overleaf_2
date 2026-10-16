import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../../apps/collab/src/server.js";
import { SnapshotService } from "../../../apps/collab/src/persistence/snapshots.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-01 Zero acknowledged edits lost after snapshot compaction and restart (S07-T12)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("preserves exact document content across snapshot compaction and server restart", async () => {
    // 1. Connect client and write text
    const ticket1 = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    const client1 = await fixture.createClient(ticket1);

    const doc1 = new Y.Doc();
    const text1 = doc1.getText("content");
    text1.insert(
      0,
      "\\documentclass{article}\n\\title{Compaction Test}\n\\begin{document}\nInitial.\n\\end{document}\n",
    );

    const ack = await client1.sendUpdate(Y.encodeStateAsUpdate(doc1));
    expect(ack.type).toBe("text.durable_ack");
    await client1.close();

    // 2. Perform compaction with pruning
    const snapshotService = new SnapshotService(fixture.db);
    const compactRes = await snapshotService.compact(fixture.fileId, {
      pruneCoveredUpdates: true,
    });
    expect(compactRes.snapshotId).toBeDefined();

    // 3. Stop server and restart
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

    // 4. Connect client to restarted server
    const ticket2 = await fixture.getTicket(fixture.owner.email, fixture.fileId, "read");
    const client2 = await fixture.createClient(ticket2, {
      serverUrl: `ws://127.0.0.1:${newPort}`,
    });

    const syncMsg = client2.initialSync;
    expect(syncMsg.type).toBe("auth.ok");
    expect(syncMsg.updateBase64).toBeDefined();

    const recoveredDoc = new Y.Doc();
    Y.applyUpdate(recoveredDoc, Buffer.from(syncMsg.updateBase64, "base64"));
    expect(recoveredDoc.getText("content").toString()).toBe(text1.toString());

    await client2.close();
    await restartedCollabServer.stop();
  });
});
