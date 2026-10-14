import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../../apps/collab/src/server.js";
import { CollabRedisCoordinator } from "../../../apps/collab/src/redis.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-02 Five simultaneous editors converge across replicas (S07-T07)", () => {
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

  it("converges 5 simultaneous editors distributed across two server replicas", async () => {
    const fileId = fixture.fileId;
    const projectId = fixture.projectId;

    // Create 3 additional users using fixture.sessionFixture.seed()
    const extraUsers: Array<{ id: string; email: string }> = [];
    for (let i = 1; i <= 3; i++) {
      const seeded = await fixture.sessionFixture.seed();
      await fixture.db.query(
        `INSERT INTO project_members (project_id, user_id, role, joined_at)
         VALUES ($1, $2, 'EDITOR', NOW())`,
        [projectId, seeded.id],
      );
      extraUsers.push(seeded);
    }

    // Direct ticket issuance for the extra users via ticketStore
    const allUsers = [
      { id: fixture.owner.id, email: fixture.owner.email, replica: 1 },
      { id: fixture.editor.id, email: fixture.editor.email, replica: 2 },
      { id: extraUsers[0]!.id, email: extraUsers[0]!.email, replica: 1 },
      { id: extraUsers[1]!.id, email: extraUsers[1]!.email, replica: 2 },
      { id: extraUsers[2]!.id, email: extraUsers[2]!.email, replica: 1 },
    ];

    const clients: Awaited<ReturnType<CollabTestFixture["createClient"]>>[] = [];
    const docs: Y.Doc[] = [];

    for (const u of allUsers) {
      const ticket = await fixture.getTicket(u.email, fileId, "write");
      const serverUrl = u.replica === 2 ? server2Url : undefined;
      const client = await fixture.createClient(ticket, { serverUrl });
      clients.push(client);

      const doc = new Y.Doc();
      docs.push(doc);
    }

    // Each of the 5 clients generates an edit
    const updates: Uint8Array[] = [];
    for (let i = 0; i < 5; i++) {
      const text = docs[i]!.getText("content");
      text.insert(0, `Paragraph from editor ${i + 1}\n`);
      updates.push(Y.encodeStateAsUpdate(docs[i]!));
    }

    // Set up listeners on all clients for peer updates
    // Each client expects 4 updates from peers
    const peerPromises = clients.map((client, idx) => {
      let count = 0;
      return new Promise<void>((resolve) => {
        const handler = (msg: Record<string, unknown>) => {
          if (msg.type === "sync.update") {
            Y.applyUpdate(docs[idx]!, Buffer.from(String(msg.updateBase64), "base64"));
            count++;
            if (count >= 4) {
              resolve();
            }
          }
        };
        client.ws.on("message", (raw: { toString: () => string }) => {
          try {
            handler(JSON.parse(raw.toString()) as Record<string, unknown>);
          } catch {}
        });
      });
    });

    // Send all 5 updates concurrently
    await Promise.all(clients.map((client, i) => client.sendUpdate(updates[i]!)));

    // Await peer synchronization across all clients
    await Promise.all(peerPromises);

    // Verify all 5 documents converged to identical text
    const canonicalText = docs[0]!.getText("content").toString();
    for (let i = 1; i < 5; i++) {
      expect(docs[i]!.getText("content").toString()).toBe(canonicalText);
    }

    for (let i = 0; i < 5; i++) {
      expect(canonicalText).toContain(`Paragraph from editor ${i + 1}`);
    }

    for (const client of clients) {
      await client.close();
    }
  });
});
