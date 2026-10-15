import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("S08-T08 invitation lifecycle denials (COL-04)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let projectId: string;
  let otherProjectId: string;
  let owner: { id: string; email: string };
  let recipient: { id: string; email: string };
  const delivered: Array<{ email: string; token: string }> = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      sendProjectInvitation: async (email, token) => {
        delivered.push({ email, token });
      },
    });
    owner = await fixture.seed();
    recipient = await fixture.seed();
    projectId = randomUUID();
    otherProjectId = randomUUID();
    for (const id of [projectId, otherProjectId]) {
      await fixture.db.query("INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Invite lifecycle')", [
        id,
        owner.id,
      ]);
    }
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

  it("consumes rejected invitations and keeps them project-scoped", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: ownerHeaders,
      payload: { email: recipient.email, role: "REVIEWER" },
    });
    expect(created.statusCode).toBe(201);
    const token = delivered.at(-1)!.token;
    const recipientHeaders = await headers(recipient.email);
    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/reject",
      headers: recipientHeaders,
      payload: { token },
    });
    expect(rejected.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/reject",
          headers: recipientHeaders,
          payload: { token },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: recipientHeaders,
          payload: { token },
        })
      ).statusCode,
    ).toBe(404);
    const membership = await fixture.db.query(
      "SELECT user_id FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, recipient.id],
    );
    expect(membership.rows).toHaveLength(0);
    const foreign = await fixture.db.query(
      "SELECT user_id FROM project_members WHERE project_id = $1 AND user_id = $2",
      [otherProjectId, recipient.id],
    );
    expect(foreign.rows).toHaveLength(0);
  });

  it("rejects non-owner invitation management", async () => {
    const outsider = await fixture.seed();
    const outsiderHeaders = await headers(outsider.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/invitations`,
          headers: outsiderHeaders,
          payload: { email: outsider.email, role: "VIEWER" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/invitations/${randomUUID()}`,
          headers: outsiderHeaders,
        })
      ).statusCode,
    ).toBe(404);
  });
});
