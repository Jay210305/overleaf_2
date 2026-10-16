import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";

describe("S07-T01 Authenticated Hocuspocus file rooms integration", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("loads canonical Y.Doc in stable room project:projectId:file:fileId upon valid authenticated connection", async () => {
    // 1. Get ticket for editor
    const ticket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");

    // 2. Connect client
    const client = await fixture.createClient(ticket);
    expect(client.initialSync).toBeDefined();
    expect(client.initialSync.type).toBe("auth.ok");
    expect(client.initialSync.roomId).toBe(`project:${fixture.projectId}:file:${fixture.fileId}`);
    expect(client.initialSync.fileId).toBe(fixture.fileId);
    expect(client.initialSync.role).toBe("EDITOR");
    expect(client.initialSync.lastPersistedSeq).toBe(0);

    await client.close();
  });

  it("denies missing, foreign, or expired tickets before reading source", async () => {
    // 1. Missing / invalid ticket
    await expect(fixture.createClient("invalid-ticket-1234567890")).rejects.toThrow(
      /Auth error: TICKET_INVALID_OR_EXPIRED/,
    );

    // 2. Ticket for foreign/non-existent file
    const foreignFileId = randomUUID();
    const storeTicket = await fixture.ticketStore.createTicket({
      userId: fixture.editor.id,
      projectId: fixture.projectId,
      fileId: foreignFileId,
      action: "write",
      sessionId: randomUUID(),
    });

    await expect(
      fixture.createClient(storeTicket.ticket, { fileId: foreignFileId }),
    ).rejects.toThrow(/RESOURCE_NOT_FOUND/);

    // 3. Expired ticket (created with 0s TTL)
    const expiredTicket = await fixture.ticketStore.createTicket(
      {
        userId: fixture.editor.id,
        projectId: fixture.projectId,
        fileId: fixture.fileId,
        action: "write",
        sessionId: randomUUID(),
      },
      -1, // expired in the past
    );

    await expect(fixture.createClient(expiredTicket.ticket)).rejects.toThrow(
      /TICKET_INVALID_OR_EXPIRED/,
    );
  });

  it("denies ticket reuse / replay atomically", async () => {
    const ticket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");

    // First use succeeds
    const client1 = await fixture.createClient(ticket);
    expect(client1.initialSync.type).toBe("auth.ok");
    await client1.close();

    // Second use of the EXACT same ticket must fail (atomically consumed)
    await expect(fixture.createClient(ticket)).rejects.toThrow(/TICKET_INVALID_OR_EXPIRED/);
  });

  it("denies wrong Origin header with 4003 ORIGIN_NOT_ALLOWED", async () => {
    const ticket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");

    await expect(
      fixture.createClient(ticket, { origin: "http://malicious-site.test" }),
    ).rejects.toThrow(/ORIGIN_NOT_ALLOWED/);
  });

  it("enforces WSS write permissions: VIEWER cannot mutate text", async () => {
    const viewerTicket = await fixture.getTicket(fixture.viewer.email, fixture.fileId, "read");
    const viewerClient = await fixture.createClient(viewerTicket);

    expect(viewerClient.initialSync.role).toBe("VIEWER");
    expect(viewerClient.initialSync.action).toBe("read");

    // Viewer generates a Yjs edit and tries to send it over WSS
    const tempDoc = new Y.Doc();
    const ytext = tempDoc.getText("content");
    ytext.insert(0, "Unauthorized viewer text edit");
    const update = Y.encodeStateAsUpdate(tempDoc);

    const errPromise = viewerClient.waitForMessage((m) => m.type === "error");
    viewerClient.ws.send(
      JSON.stringify({
        type: "sync.update",
        updateBase64: Buffer.from(update).toString("base64"),
      }),
    );

    const err = await errPromise;
    expect(err.code).toBe("PERMISSION_DENIED");

    await viewerClient.close();
  });

  it("confirms invariant: Broadcast receipt without PG commit cannot produce saved acknowledgement", async () => {
    const editorTicket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");
    const client = await fixture.createClient(editorTicket);

    // Apply an update
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "\\section{Durability Invariant}\n");
    const update = Y.encodeStateAsUpdate(doc);

    // Send update and receive ACK
    const ack = await client.sendUpdate(update);
    expect(ack.type).toBe("text.durable_ack");
    expect(ack.persistedSeq).toBeGreaterThan(0);
    expect(ack.fileId).toBe(fixture.fileId);
    expect(ack.stateVectorBase64).toBeDefined();

    // Verify row was actually committed in PostgreSQL
    const dbRes = await fixture.db.query<{ count: string }>(
      `SELECT count(*) FROM crdt_updates WHERE file_id = $1 AND seq = $2`,
      [fixture.fileId, ack.persistedSeq],
    );
    expect(Number(dbRes.rows[0]?.count)).toBe(1);

    await client.close();
  });

  it("denies missing Origin header with 4003 ORIGIN_NOT_ALLOWED when allowedOrigin is configured", async () => {
    const ticket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");

    await expect(fixture.createClient(ticket, { origin: "" })).rejects.toThrow(
      /ORIGIN_NOT_ALLOWED/,
    );
  });

  it("terminates unresponsive socket during checkHeartbeats if client goes dead", async () => {
    const ticket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "read");
    const client = await fixture.createClient(ticket);

    // Initial state: client is alive
    const room = fixture.collabServer.getRoom(
      `project:${fixture.projectId}:file:${fixture.fileId}`,
    );
    expect(room).toBeDefined();
    expect(room!.clients.size).toBeGreaterThanOrEqual(1);

    // Mock client not responding to ping
    const collabClient = Array.from(room!.clients).find((c) => c.auth?.userId === fixture.owner.id);
    expect(collabClient).toBeDefined();
    collabClient!.isAlive = false;

    const closePromise = new Promise<void>((resolve) => {
      client.ws.once("close", () => resolve());
    });

    // Run checkHeartbeats
    fixture.collabServer.checkHeartbeats();

    // Socket should be terminated by server
    await closePromise;
    expect(room!.clients.has(collabClient!)).toBe(false);
  });
});
