import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../../apps/collab/src/server.js";
import { CollabRedisCoordinator } from "../../../apps/collab/src/redis.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("COL-01 Concurrent editing across replicas convergence (S07-T07)", () => {
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

  it("converges concurrent edits sent simultaneously to separate server replicas", async () => {
    const fileId = fixture.fileId;

    const ticketA = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const ticketB = await fixture.getTicket(fixture.editor.email, fileId, "write");

    const clientA = await fixture.createClient(ticketA);
    const clientB = await fixture.createClient(ticketB, {
      serverUrl: server2Url,
    });

    const docA = new Y.Doc();
    const docB = new Y.Doc();

    docA.getText("content").insert(0, "Alice concurrent replica 1\n");
    docB.getText("content").insert(0, "Bob concurrent replica 2\n");

    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);

    const bReceivedByA = clientA.waitForMessage((m) => m.type === "sync.update");
    const aReceivedByB = clientB.waitForMessage((m) => m.type === "sync.update");

    await Promise.all([
      clientA.sendUpdate(updateA),
      clientB.sendUpdate(updateB),
    ]);

    const msgB = await bReceivedByA;
    const msgA = await aReceivedByB;

    Y.applyUpdate(docA, Buffer.from(msgB.updateBase64, "base64"));
    Y.applyUpdate(docB, Buffer.from(msgA.updateBase64, "base64"));

    expect(docA.getText("content").toString()).toBe(docB.getText("content").toString());
    expect(docA.getText("content").toString()).toContain("Alice concurrent replica 1");
    expect(docA.getText("content").toString()).toContain("Bob concurrent replica 2");

    await clientA.close();
    await clientB.close();
  });
});
