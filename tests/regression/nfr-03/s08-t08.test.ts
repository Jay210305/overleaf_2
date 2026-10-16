import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("S08-T08 revoked users lose REST, ticket and notification access (NFR-03)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let fileId: string;
  let owner: { id: string; email: string };
  let member: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    member = await fixture.seed();
    projectId = randomUUID();
    fileId = randomUUID();
    await fixture.db.query("INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'NFR-03')", [
      projectId,
      owner.id,
    ]);
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')",
      [projectId, member.id],
    );
    await fixture.db.query(
      "INSERT INTO project_nodes (id, project_id, name, kind, mime, content_kind) VALUES ($1, $2, 'main.tex', 'FILE', 'text/x-tex', 'TEXT')",
      [fileId, projectId],
    );
    await fixture.db.query(
      "INSERT INTO notifications (user_id, type, payload_json) VALUES ($1, 'mention', $2)",
      [member.id, JSON.stringify({ projectId, sourceId: randomUUID() })],
    );
  });

  afterAll(async () => {
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

  it("serves the member before revocation and nothing after", async () => {
    const memberHeaders = await headers(member.email);
    const ticket = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/collab-ticket`,
      headers: memberHeaders,
      payload: { fileId, action: "read" },
    });
    expect(ticket.statusCode).toBe(200);
    const feed = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me/notifications",
      headers: memberHeaders,
    });
    expect(feed.statusCode).toBe(200);
    expect(feed.json().items).toHaveLength(1);
    const notificationId = feed.json().items[0].id as string;

    const ownerHeaders = await headers(owner.email);
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/members/${member.id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(204);

    const ticketDenied = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/collab-ticket`,
      headers: memberHeaders,
      payload: { fileId, action: "read" },
    });
    expect(ticketDenied.statusCode).toBe(404);
    const chatDenied = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/chat/messages`,
      headers: memberHeaders,
      payload: { body: "muted" },
    });
    expect(chatDenied.statusCode).toBe(404);
    const membersDenied = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/members`,
      headers: memberHeaders,
    });
    expect(membersDenied.statusCode).toBe(404);
    const hidden = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me/notifications",
      headers: memberHeaders,
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().items).toHaveLength(0);
    expect(
      (
        await fixture.app.inject({
          method: "PATCH",
          url: `/api/v1/me/notifications/${notificationId}/read`,
          headers: memberHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  });
});
