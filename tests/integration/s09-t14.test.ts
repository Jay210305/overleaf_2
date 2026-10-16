import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S09-T14: Delete account under shared ownership rules", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("denies deletion with invalid credentials, forged CSRF, or malformed body", async () => {
    const user = await fixture.seed();
    const session = await fixture.login(user.email, "correct-password-123");
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    // Missing CSRF
    const resNoCsrf = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/delete",
      headers: { origin, cookie },
      payload: { password: "correct-password-123" },
    });
    expect(resNoCsrf.statusCode).toBe(403);

    // Wrong password
    const resWrongPass = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/delete",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { password: "wrong-password" },
    });
    expect(resWrongPass.statusCode).toBe(403);

    // Empty/malformed payload
    const resEmpty = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/delete",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {},
    });
    expect(resEmpty.statusCode).toBe(400);
  });

  it("rejects account deletion with 409 SOLE_OWNER_CONFLICT if user owns active or archived projects", async () => {
    const owner = await fixture.seed();
    const session = await fixture.login(owner.email, "correct-password-123");
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    // Create an owned project
    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Sole Project ${randomUUID()}`, owner.id],
    );
    const projectId = projRes.rows[0]!.id;

    // Attempt delete account
    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/delete",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { currentPassword: "correct-password-123" },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe("SOLE_OWNER_CONFLICT");

    // Clean up project
    await fixture.db.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
  });

  it("successfully deletes account when no owned projects remain, revoking sessions and clearing cookie", async () => {
    const user = await fixture.seed();
    const otherUser = await fixture.seed();

    // User is a collaborator on otherUser's project
    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Collaborator Project ${randomUUID()}`, otherUser.id],
    );
    const sharedProjectId = projRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [sharedProjectId, user.id],
    );

    // User has a tag
    await fixture.db.query(
      `INSERT INTO project_tags (user_id, name, color) VALUES ($1, 'Delete Me Tag', '#aabbcc')`,
      [user.id],
    );

    // User logs in and has 2 sessions
    await fixture.login(user.email, "correct-password-123");
    const s2 = await fixture.login(user.email, "correct-password-123");
    const cookie2 = String(s2.headers["set-cookie"]).split(";")[0]!;
    const csrf2 = String(s2.headers["x-csrf-token"]);

    // User executes account deletion via DELETE /api/v1/me
    const res = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/me",
      headers: { origin, cookie: cookie2, "x-csrf-token": csrf2 },
      payload: { password: "correct-password-123" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.deleted).toBe(true);

    // Response cleared session cookie
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain("Max-Age=0");

    // User record is disabled
    const userDb = await fixture.db.query<{ disabled_at: Date | null }>(
      `SELECT disabled_at FROM users WHERE id = $1`,
      [user.id],
    );
    expect(userDb.rows[0]!.disabled_at).not.toBeNull();

    // All sessions revoked
    const sessions = await fixture.db.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM sessions WHERE user_id = $1`,
      [user.id],
    );
    expect(sessions.rows.length).toBeGreaterThanOrEqual(2);
    for (const row of sessions.rows) {
      expect(row.revoked_at).not.toBeNull();
    }

    // Collaborator membership removed
    const members = await fixture.db.query(`SELECT * FROM project_members WHERE user_id = $1`, [
      user.id,
    ]);
    expect(members.rows.length).toBe(0);

    // Project itself is still intact for otherUser
    const projCheck = await fixture.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1`,
      [sharedProjectId],
    );
    expect(projCheck.rows[0]!.owner_id).toBe(otherUser.id);

    // Subsequent authenticated calls are rejected
    const verifyCall = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { origin, cookie: cookie2 },
    });
    expect(verifyCall.statusCode).toBe(401);
  });
});
