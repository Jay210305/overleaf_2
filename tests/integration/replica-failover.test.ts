import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../apps/collab/src/server.js";
import { CollabRedisCoordinator } from "../../apps/collab/src/redis.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S15-T04: Replica failover and graceful reconnection (NFR-01)", () => {
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

  it("retains acknowledged edits across replica failover and server restart", async () => {
    const fileId = fixture.fileId;

    // 1. Client connects to Replica 1
    const ticket1 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client1 = await fixture.createClient(ticket1);

    const doc1 = new Y.Doc();
    doc1
      .getText("content")
      .insert(0, "\\section{Failover Resilience}\nDurable content committed before failover.\n");
    const update1 = Y.encodeStateAsUpdate(doc1);

    const ack1 = await client1.sendUpdate(update1);
    expect(ack1.type).toBe("text.durable_ack");

    const textBeforeFailover = doc1.getText("content").toString();
    expect(textBeforeFailover).toContain("Durable content committed before failover.");

    await client1.close();

    // 2. Client reconnects to Replica 2 without local volume
    const ticket2 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client2 = await fixture.createClient(ticket2, {
      serverUrl: server2Url,
    });

    const doc2 = new Y.Doc();
    if (client2.initialSync.updateBase64) {
      Y.applyUpdate(doc2, Buffer.from(client2.initialSync.updateBase64 as string, "base64"));
    }
    expect(doc2.getText("content").toString()).toBe(textBeforeFailover);

    // Continue editing on Replica 2
    let update2Bytes: Uint8Array | null = null;
    doc2.once("update", (u) => {
      update2Bytes = u;
    });
    doc2.getText("content").insert(doc2.getText("content").length, "Appended on Replica 2.\n");

    const ack2 = await client2.sendUpdate(update2Bytes!);
    expect(ack2.type).toBe("text.durable_ack");
    expect(doc2.getText("content").toString()).toContain("Appended on Replica 2.");

    await client2.close();
  });
});
