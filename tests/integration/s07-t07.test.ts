import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../apps/collab/src/server.js";
import { CollabRedisCoordinator } from "../../apps/collab/src/redis.js";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T07 Coordinate two collaboration replicas integration", () => {
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

  it("permits clients to cross replicas seamlessly without sticky sessions", async () => {
    const fileId = fixture.fileId;

    // 1. Client connects to Replica 1 and makes an edit
    const ticket1 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const clientReplica1 = await fixture.createClient(ticket1);

    const doc = new Y.Doc();
    doc.getText("content").insert(0, "Written on Replica 1\n");
    const update1 = Y.encodeStateAsUpdate(doc);
    const ack1 = await clientReplica1.sendUpdate(update1);
    expect(ack1.type).toBe("text.durable_ack");

    await clientReplica1.close();

    // 2. Client reconnects to Replica 2 (no sticky session required)
    const ticket2 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const clientReplica2 = await fixture.createClient(ticket2, {
      serverUrl: server2Url,
    });

    // Initial sync from Replica 2 must reflect update1
    const syncMsg = clientReplica2.initialSync;
    expect(syncMsg.type).toBe("auth.ok");
    const docOnReplica2 = new Y.Doc();
    Y.applyUpdate(docOnReplica2, Buffer.from(syncMsg.updateBase64, "base64"));
    expect(docOnReplica2.getText("content").toString()).toContain("Written on Replica 1");

    // 3. Client makes a second edit on Replica 2
    docOnReplica2.getText("content").insert(docOnReplica2.getText("content").length, "Written on Replica 2\n");
    const update2 = Y.encodeStateAsUpdate(docOnReplica2, Y.encodeStateVector(doc));
    const ack2 = await clientReplica2.sendUpdate(update2);
    expect(ack2.type).toBe("text.durable_ack");
    expect(ack2.persistedSeq).toBeGreaterThan(ack1.persistedSeq);

    await clientReplica2.close();
  });

  it("propagates collaborator awareness and userId across separate server replicas", async () => {
    const fileId = fixture.fileId;

    // Client 1 on Replica 1
    const ticket1 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client1 = await fixture.createClient(ticket1);

    // Client 2 on Replica 2
    const ticket2 = await fixture.getTicket(fixture.editor.email, fileId, "write");
    const client2 = await fixture.createClient(ticket2, {
      serverUrl: server2Url,
    });

    const awarenessPromise = client2.waitForMessage(
      (m) => m.type === "awareness" && m.userId === fixture.owner.id,
    );

    // Client 1 sends awareness
    client1.send({
      type: "awareness",
      awareness: {
        cursor: { line: 12, col: 4 },
        user: { name: "Alice Owner", color: "#10b981" },
      },
    });

    const received = await awarenessPromise;
    expect(received.type).toBe("awareness");
    expect(received.userId).toBe(fixture.owner.id);
    expect(received.awareness.cursor.line).toBe(12);

    await client1.close();
    await client2.close();
  });

  it("propagates revocation events across replicas via Redis coordinator", async () => {
    const fileId = fixture.fileId;

    // Client on Replica 2
    const ticket = await fixture.getTicket(fixture.editor.email, fileId, "write");
    const clientReplica2 = await fixture.createClient(ticket, {
      serverUrl: server2Url,
    });

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      clientReplica2.ws.once("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Revocation event published through Coordinator 1
    await coord1.publishInvalidation({
      type: "member_removed",
      userId: fixture.editor.id,
      projectId: fixture.projectId,
    });

    const closeEvent = await closePromise;
    expect(closeEvent.code).toBe(4403);
    expect(closeEvent.reason).toBe("MEMBER_REMOVED");
  });
});
