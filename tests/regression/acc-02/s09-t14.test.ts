import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression ACC-02 (S09-T14): Session inventory revocation and cookie clearing on account deletion", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("revokes all sessions in session inventory, writes audit log, and clears opaque session cookie", async () => {
    const user = await fixture.seed();

    // Login from multiple devices/sessions
    const session1 = await fixture.login(user.email, "correct-password-123");
    await fixture.login(user.email, "correct-password-123");
    const session3 = await fixture.login(user.email, "correct-password-123");

    const cookie3 = String(session3.headers["set-cookie"]).split(";")[0]!;
    const csrf3 = String(session3.headers["x-csrf-token"]);

    // Account deletion call using session 3
    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/delete",
      headers: {
        origin,
        cookie: cookie3,
        "x-csrf-token": csrf3,
      },
      payload: {
        currentPassword: "correct-password-123",
      },
    });

    expect(res.statusCode).toBe(200);

    // 1. Cookie is cleared
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain("Max-Age=0");

    // 2. All 3 sessions in the database are revoked
    const sessions = await fixture.db.query<{ id: string; revoked_at: Date | null }>(
      `SELECT id, revoked_at FROM sessions WHERE user_id = $1`,
      [user.id],
    );
    expect(sessions.rows.length).toBeGreaterThanOrEqual(3);
    for (const s of sessions.rows) {
      expect(s.revoked_at).not.toBeNull();
    }

    // 3. Audit trail exists for session revocation and account deletion
    const auditEvents = await fixture.db.query<{ action: string; target_id: string }>(
      `SELECT action, target_id FROM audit_events WHERE actor_id = $1 ORDER BY occurred_at ASC`,
      [user.id],
    );
    const actions = auditEvents.rows.map((r) => r.action);
    expect(actions).toContain("account.deleted");
    expect(actions).toContain("session.revoked");

    // 4. Session 1 cookie is no longer usable
    const cookie1 = String(session1.headers["set-cookie"]).split(";")[0]!;
    const probe = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { origin, cookie: cookie1 },
    });
    expect(probe.statusCode).toBe(401);
  });
});
