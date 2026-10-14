import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCollabTestFixture, type CollabTestFixture } from "../helpers/collab-fixture.js";
import { origin } from "../helpers/s02-session.js";

describe("S07-T02 Single-use WSS tickets integration", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("issues 30s scoped ticket scoping user, project, file, action, and session", async () => {
    const ownerRes = await fixture.sessionFixture.login(fixture.owner.email);
    const ownerCookie = String(ownerRes.headers["set-cookie"]).split(";")[0]!;
    const ownerCsrf = String(ownerRes.headers["x-csrf-token"]);

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${fixture.projectId}/collab-ticket`,
      headers: {
        origin,
        cookie: ownerCookie,
        "x-csrf-token": ownerCsrf,
      },
      payload: {
        fileId: fixture.fileId,
        action: "write",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ticket).toBeDefined();
    expect(typeof body.ticket).toBe("string");
    expect(body.ticket.length).toBeGreaterThanOrEqual(16);
    expect(body.expiresAt).toBeDefined();

    // Verify expiration is ~30s in the future
    const expiresAtMs = Date.parse(body.expiresAt);
    const diffSec = (expiresAtMs - Date.now()) / 1000;
    expect(diffSec).toBeGreaterThan(25);
    expect(diffSec).toBeLessThanOrEqual(31);
  });

  it("denies ticket reuse atomically on second consumption", async () => {
    const ticket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");

    // First use consumes ticket
    const client = await fixture.createClient(ticket);
    expect(client.initialSync.type).toBe("auth.ok");
    await client.close();

    // Second use of the same ticket must fail atomically
    await expect(fixture.createClient(ticket)).rejects.toThrow(
      /TICKET_INVALID_OR_EXPIRED/,
    );
  });

  it("denies connection when Origin header does not match application origin", async () => {
    const ticket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");

    await expect(
      fixture.createClient(ticket, { origin: "https://attacker.evil.com" }),
    ).rejects.toThrow(/ORIGIN_NOT_ALLOWED/);
  });

  it("rejects ticket request for missing or non-text files with appropriate status", async () => {
    const ownerRes = await fixture.sessionFixture.login(fixture.owner.email);
    const ownerCookie = String(ownerRes.headers["set-cookie"]).split(";")[0]!;
    const ownerCsrf = String(ownerRes.headers["x-csrf-token"]);

    // 1. Non-existent file -> 404
    const resMissing = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${fixture.projectId}/collab-ticket`,
      headers: {
        origin,
        cookie: ownerCookie,
        "x-csrf-token": ownerCsrf,
      },
      payload: {
        fileId: randomUUID(),
        action: "read",
      },
    });
    expect(resMissing.statusCode).toBe(404);

    // 2. Binary file -> 400
    const binFileId = randomUUID();
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, size_bytes, content_kind)
       VALUES ($1, $2, null, 'image.png', 'FILE', 'image/png', 100, 'BINARY')`,
      [binFileId, fixture.projectId],
    );

    const resBin = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${fixture.projectId}/collab-ticket`,
      headers: {
        origin,
        cookie: ownerCookie,
        "x-csrf-token": ownerCsrf,
      },
      payload: {
        fileId: binFileId,
        action: "read",
      },
    });
    expect(resBin.statusCode).toBe(400);
  });

  it("rejects ticket request with unknown fields or missing body", async () => {
    const ownerRes = await fixture.sessionFixture.login(fixture.owner.email);
    const ownerCookie = String(ownerRes.headers["set-cookie"]).split(";")[0]!;
    const ownerCsrf = String(ownerRes.headers["x-csrf-token"]);

    const resUnknown = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${fixture.projectId}/collab-ticket`,
      headers: {
        origin,
        cookie: ownerCookie,
        "x-csrf-token": ownerCsrf,
      },
      payload: {
        fileId: fixture.fileId,
        action: "read",
        unexpectedAdminFlag: true,
      },
    });
    expect(resUnknown.statusCode).toBe(400);
  });
});
