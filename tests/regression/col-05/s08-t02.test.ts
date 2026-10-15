import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { MemoryTicketStore } from "../../../apps/api/src/modules/collab/ticket.js";
import { authenticateConnection } from "../../../apps/collab/src/auth/authenticate.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("COL-05 link grants at the REST and WSS boundary", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let projectId: string;
  let fileId: string;
  let ownerEmail: string;
  let viewerEmail: string;
  const tickets = new MemoryTicketStore();

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    const viewer = await fixture.seed();
    ownerEmail = owner.email;
    viewerEmail = viewer.email;
    projectId = randomUUID();
    fileId = randomUUID();
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Link boundary')",
      [projectId, owner.id],
    );
    await fixture.db.query(
      "INSERT INTO project_nodes (id, project_id, name, kind, mime, content_kind) VALUES ($1, $2, 'main.tex', 'FILE', 'text/x-tex', 'TEXT')",
      [fileId, projectId],
    );
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      ticketStore: tickets,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  async function headers(email: string) {
    const login = await fixture.login(email);
    expect(login.statusCode).toBe(200);
    return {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(login.headers["x-csrf-token"]),
    };
  }

  it("denies a preissued collaboration ticket after the link grant expires", async () => {
    const ownerHeaders = await headers(ownerEmail);
    const viewerHeaders = await headers(viewerEmail);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "VIEWER", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(created.statusCode).toBe(201);
    const { link, token } = created.json();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: viewerHeaders,
          payload: { token },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/collab-ticket`,
          headers: viewerHeaders,
          payload: { fileId, action: "write" },
        })
      ).statusCode,
    ).toBe(403);
    const ticketResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/collab-ticket`,
      headers: viewerHeaders,
      payload: { fileId, action: "read" },
    });
    expect(ticketResponse.statusCode).toBe(200);
    await fixture.db.query(
      "UPDATE share_links SET created_at = NOW() - interval '2 minutes', expires_at = NOW() - interval '1 second' WHERE id = $1",
      [link.id],
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}`,
          headers: viewerHeaders,
        })
      ).statusCode,
    ).toBe(404);
    await expect(
      authenticateConnection(
        {
          ticket: ticketResponse.json().ticket,
          origin,
          allowedOrigin: origin,
          expectedProjectId: projectId,
          expectedFileId: fileId,
        },
        tickets,
        fixture.db,
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_REVOKED" });
  });
});
