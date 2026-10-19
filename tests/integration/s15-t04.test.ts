import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../apps/collab/src/server.js";
import { CollabRedisCoordinator } from "../../apps/collab/src/redis.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S15-T04: Multi-replica API and collab deployment integration", () => {
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

  it("exchanges real-time edits between clients across independent server replicas", async () => {
    const fileId = fixture.fileId;

    // Client A on Replica 1
    const ticketA = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const clientA = await fixture.createClient(ticketA);

    // Client B on Replica 2
    const ticketB = await fixture.getTicket(fixture.editor.email, fileId, "write");
    const clientB = await fixture.createClient(ticketB, {
      serverUrl: server2Url,
    });

    const docA = new Y.Doc();
    const docB = new Y.Doc();
    if (clientA.initialSync.updateBase64) {
      Y.applyUpdate(docA, Buffer.from(clientA.initialSync.updateBase64 as string, "base64"));
    }
    if (clientB.initialSync.updateBase64) {
      Y.applyUpdate(docB, Buffer.from(clientB.initialSync.updateBase64 as string, "base64"));
    }

    // Client A inserts text
    let updateABytes: Uint8Array | null = null;
    docA.once("update", (u) => {
      updateABytes = u;
    });
    docA.getText("content").insert(0, "Collaborative text from Replica 1.\n");

    const clientBReceivedUpdateA = clientB.waitForMessage((m) => m.type === "sync.update");
    const ackA = await clientA.sendUpdate(updateABytes!);
    expect(ackA.type).toBe("text.durable_ack");

    const msgToB = await clientBReceivedUpdateA;
    expect(msgToB.type).toBe("sync.update");
    Y.applyUpdate(docB, Buffer.from(msgToB.updateBase64 as string, "base64"));
    expect(docB.getText("content").toString()).toContain("Collaborative text from Replica 1.\n");

    // Client B appends text on Replica 2
    let updateBBytes: Uint8Array | null = null;
    docB.once("update", (u) => {
      updateBBytes = u;
    });
    docB
      .getText("content")
      .insert(docB.getText("content").length, "Appended by Replica 2 editor.\n");

    const clientAReceivedUpdateB = clientA.waitForMessage((m) => m.type === "sync.update");
    const ackB = await clientB.sendUpdate(updateBBytes!);
    expect(ackB.type).toBe("text.durable_ack");

    const msgToA = await clientAReceivedUpdateB;
    expect(msgToA.type).toBe("sync.update");
    Y.applyUpdate(docA, Buffer.from(msgToA.updateBase64 as string, "base64"));

    expect(docA.getText("content").toString()).toBe(
      "Collaborative text from Replica 1.\nAppended by Replica 2 editor.\n",
    );
    expect(docB.getText("content").toString()).toBe(docA.getText("content").toString());

    await clientA.close();
    await clientB.close();
  });
});
