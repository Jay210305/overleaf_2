import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import http from "node:http";
import { CollabServer } from "../../../apps/collab/src/server.js";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";

describe("NFR-01 S15-T04: Zero acknowledged edits lost after controlled server restart regression", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("guarantees 100% data durability across complete server restart", async () => {
    const fileId = fixture.fileId;

    // 1. Client connects to server
    const ticket1 = await fixture.getTicket(fixture.owner.email, fileId, "write");
    const client1 = await fixture.createClient(ticket1);

    const importantPayload = [
      "\\documentclass{article}",
      "\\begin{document}",
      "\\section{Durability Invariant NFR-01}",
      "This mission-critical text must survive server restarts.",
      "Mathematical formula: $E = mc^2$",
      "\\end{document}",
    ].join("\n");

    const doc1 = new Y.Doc();
    doc1.getText("content").insert(0, importantPayload);
    const update1 = Y.encodeStateAsUpdate(doc1);

    const ack1 = await client1.sendUpdate(update1);
    expect(ack1.type).toBe("text.durable_ack");

    await client1.close();

    // 2. Simulate controlled server restart: create a new CollabServer on a fresh port
    const freshHttpServer = http.createServer();
    await new Promise<void>((resolve) => freshHttpServer.listen(0, () => resolve()));
    const freshPort = (freshHttpServer.address() as { port: number }).port;
    const freshUrl = `ws://127.0.0.1:${freshPort}`;

    const freshServer = new CollabServer({
      server: freshHttpServer,
      allowedOrigin: fixture.sessionFixture.origin,
      db: fixture.db,
      ticketStore: fixture.ticketStore,
    });
    await freshServer.start();

    try {
      // 3. Connect new client to fresh server
      const ticket2 = await fixture.getTicket(fixture.owner.email, fileId, "write");
      const client2 = await fixture.createClient(ticket2, {
        serverUrl: freshUrl,
      });

      const doc2 = new Y.Doc();
      if (client2.initialSync.updateBase64) {
        Y.applyUpdate(doc2, Buffer.from(client2.initialSync.updateBase64 as string, "base64"));
      }

      // Verify exact content equality
      expect(doc2.getText("content").toString()).toBe(importantPayload);
      await client2.close();
    } finally {
      await freshServer.stop();
      freshHttpServer.close();
    }
  });
});
