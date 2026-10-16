import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("S08-T01 invitation denial and lifecycle regression", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let owner: { id: string; email: string };
  let recipient: { id: string; email: string };
  let outsider: { id: string; email: string };
  let projectId: string;
  let foreignProjectId: string;
  const delivered: Array<{ email: string; token: string }> = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(
          import.meta.dirname,
          "../../../packages/db/migrations/0009-project-invitations.sql",
        ),
        "utf8",
      ),
    );
    owner = await fixture.seed();
    recipient = await fixture.seed();
    outsider = await fixture.seed();
    projectId = randomUUID();
    foreignProjectId = randomUUID();
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Invitation regression')",
      [projectId, owner.id],
    );
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Foreign invitation')",
      [foreignProjectId, outsider.id],
    );
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [projectId, outsider.id],
    );
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      sendProjectInvitation: async (email, token) => {
        delivered.push({ email, token });
      },
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

  async function invite(email = recipient.email) {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: await headers(owner.email),
      payload: { email, role: "REVIEWER" },
    });
    expect(response.statusCode).toBe(201);
    return { id: response.json().id as string, token: delivered.at(-1)!.token };
  }

  it("denies non-owner, foreign-project, forged-CSRF and OWNER-role invitation creation", async () => {
    const viewerHeaders = await headers(outsider.email);
    const viewer = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: viewerHeaders,
      payload: { email: recipient.email, role: "EDITOR" },
    });
    expect(viewer.statusCode).toBe(403);
    const ownerHeaders = await headers(owner.email);
    const foreign = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${foreignProjectId}/invitations`,
      headers: ownerHeaders,
      payload: { email: recipient.email, role: "EDITOR" },
    });
    expect(foreign.statusCode).toBe(404);
    const csrf = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: { ...ownerHeaders, "x-csrf-token": "forged" },
      payload: { email: recipient.email, role: "EDITOR" },
    });
    expect(csrf.statusCode).toBe(403);
    const ownerRole = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: ownerHeaders,
      payload: { email: recipient.email, role: "OWNER" },
    });
    expect(ownerRole.statusCode).toBe(400);
    expect(delivered).toHaveLength(0);
  });

  it("does not send an unusable project invitation to an account outside the trusted registry", async () => {
    const before = delivered.length;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/invitations`,
      headers: await headers(owner.email),
      payload: { email: `unregistered-${randomUUID()}@example.test`, role: "VIEWER" },
    });
    expect(response.statusCode).toBe(404);
    expect(delivered).toHaveLength(before);
  });

  it("binds the token to recipient email and rejects it once without granting membership", async () => {
    const issued = await invite();
    const outsiderHeaders = await headers(outsider.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: outsiderHeaders,
          payload: { token: issued.token },
        })
      ).statusCode,
    ).toBe(404);
    const recipientHeaders = await headers(recipient.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/reject",
          headers: recipientHeaders,
          payload: { token: issued.token },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: recipientHeaders,
          payload: { token: issued.token },
        })
      ).statusCode,
    ).toBe(404);
    const members = await fixture.db.query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, recipient.id],
    );
    expect(members.rows).toHaveLength(0);
  });

  it("revokes a project-scoped invitation and denies an expired token", async () => {
    const issued = await invite();
    const ownerHeaders = await headers(owner.email);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${foreignProjectId}/invitations/${issued.id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/invitations/${issued.id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(204);
    const recipientHeaders = await headers(recipient.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: recipientHeaders,
          payload: { token: issued.token },
        })
      ).statusCode,
    ).toBe(404);
    const expired = await invite();
    await fixture.db.query(
      "UPDATE project_invitations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [expired.id],
    );
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers: recipientHeaders,
      payload: { token: expired.token },
    });
    expect(result.statusCode).toBe(410);
    expect(result.json().code).toBe("INVITATION_EXPIRED");
  });

  it("supersedes an older pending invitation and only accepts the newest token", async () => {
    const oldInvite = await invite();
    const newInvite = await invite();
    const recipientHeaders = await headers(recipient.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: recipientHeaders,
          payload: { token: oldInvite.token },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: recipientHeaders,
          payload: { token: newInvite.token },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("commits only one of two simultaneous redemptions", async () => {
    const concurrentRecipient = await fixture.seed();
    const issued = await invite(concurrentRecipient.email);
    const recipientHeaders = await headers(concurrentRecipient.email);
    const redeem = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/invitations/accept",
        headers: recipientHeaders,
        payload: { token: issued.token },
      });
    const results = await Promise.all([redeem(), redeem()]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 404]);
    const members = await fixture.db.query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [projectId, concurrentRecipient.id],
    );
    expect(members.rows).toHaveLength(1);
  });

  it("does not reactivate membership revoked after the invitation was issued", async () => {
    const revokedRecipient = await fixture.seed();
    const issued = await invite(revokedRecipient.email);
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, revoked_at)
       VALUES ($1, $2, 'VIEWER', NOW())`,
      [projectId, revokedRecipient.id],
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers: await headers(revokedRecipient.email),
      payload: { token: issued.token },
    });
    expect(response.statusCode).toBe(409);
    const members = await fixture.db.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, revokedRecipient.id],
    );
    expect(members.rows[0]?.revoked_at).not.toBeNull();
  });
});
