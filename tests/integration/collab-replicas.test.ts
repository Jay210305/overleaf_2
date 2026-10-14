import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../apps/collab/src/server.js";
import { CollabRedisCoordinator } from "../../apps/collab/src/redis.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("Two collaboration replicas coordination (collab-replicas)", () => {
  let fixture: CollabTestFixture;
  let server2: CollabServer;
  let httpServer2: http.Server;
  let server2Url: string;
  let coord1: CollabRedisCoordinator;
  let coord2: CollabRedisCoordinator;
  let unlink: () => void;

  beforeAll(async () => {
    coord1 = new CollabRedisCoordinator();
    coord2 = new CollabRedisCoordinator();
    unlink = CollabRedisCoordinator.linkInProcess(coord1, coord2);

    fixture = await createCollabTestFixture({
      redisCoordinator: coord1,
    });

    // Spin up second CollabServer replica
    httpServer2 = http.createServer();
    await new Promise<void>((resolve) => httpServer2.listen(0, () => resolve()));
    const port2 = (httpServer2.address() as { port: number }).port;
    server2Url = `ws://127.0.0.1:${port2}`;

    server2 = new CollabServer({
      server: httpServer2,
      allowedOrigin: fixture.sessionFixture.origin,
      db: fixture.db,
      ticketStore: fixture.ticketStore,
      redisCoordinator: coord2,
    });
    await server2.start();
  });

  afterAll(async () => {
    unlink();
    await server2.stop();
    await fixture.close();
  });

  it("converges clients connected to different server replicas via Redis coordinator", async () => {
    const fileId = fixture.fileId;

    // Client 1 connects to Replica 1
    const ticket1 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client1 = await fixture.createClient(ticket1);

    // Client 2 connects to Replica 2
    const ticket2 = await fixture.getTicket(fixture.editor.email, fileId, "write");
    const client2 = await fixture.createClient(ticket2, {
      serverUrl: server2Url,
    });

    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Client 1 writes text on Replica 1
    doc1.getText("content").insert(0, "Replica 1 line\n");
    const update1 = Y.encodeStateAsUpdate(doc1);

    const client2ReceivedUpdate1 = client2.waitForMessage((m) => m.type === "sync.update");
    const ack1 = await client1.sendUpdate(update1);
    expect(ack1.type).toBe("text.durable_ack");

    const msgFromReplica1 = await client2ReceivedUpdate1;
    expect(msgFromReplica1.type).toBe("sync.update");
    Y.applyUpdate(doc2, Buffer.from(msgFromReplica1.updateBase64, "base64"));
    expect(doc2.getText("content").toString()).toContain("Replica 1 line");

    // Client 2 writes text on Replica 2
    doc2.getText("content").insert(doc2.getText("content").length, "Replica 2 line\n");
    const update2 = Y.encodeStateAsUpdate(doc2, Y.encodeStateVector(doc1));

    const client1ReceivedUpdate2 = client1.waitForMessage((m) => m.type === "sync.update");
    const ack2 = await client2.sendUpdate(update2);
    expect(ack2.type).toBe("text.durable_ack");

    const msgFromReplica2 = await client1ReceivedUpdate2;
    expect(msgFromReplica2.type).toBe("sync.update");
    Y.applyUpdate(doc1, Buffer.from(msgFromReplica2.updateBase64, "base64"));

    // Both documents converged across replicas
    expect(doc1.getText("content").toString()).toBe(doc2.getText("content").toString());
    expect(doc1.getText("content").toString()).toBe("Replica 1 line\nReplica 2 line\n");

    await client1.close();
    await client2.close();
  });
});
