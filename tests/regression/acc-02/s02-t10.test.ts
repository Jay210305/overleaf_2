import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("S02-T10 password change session boundaries", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => fixture.close());

  it("denies missing or forged session CSRF, malformed input and a disabled account", async () => {
    const user = await fixture.seed();
    const current = await fixture.login(user.email);
    const cookie = String(current.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(current.headers["x-csrf-token"]);
    const payload = { currentPassword: "correct-password-123", newPassword: "replacement-456" };
    const call = (headers: Record<string, string>, body: object = payload) =>
      fixture.app.inject({ method: "POST", url: "/api/v1/me/password", headers, payload: body });
    expect((await call({ origin, "x-csrf-token": csrf })).statusCode).toBe(401);
    expect((await call({ origin, cookie, "x-csrf-token": "forged" })).statusCode).toBe(403);
    expect(
      (await call({ origin: "https://foreign.example", cookie, "x-csrf-token": csrf })).statusCode,
    ).toBe(403);
    expect(
      (await call({ origin, cookie, "x-csrf-token": csrf }, { ...payload, extra: true }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call({ origin, cookie, "x-csrf-token": csrf }, { ...payload, newPassword: "short" }))
        .statusCode,
    ).toBe(400);
    await fixture.db.query("UPDATE users SET disabled_at = NOW() WHERE id = $1", [user.id]);
    expect((await call({ origin, cookie, "x-csrf-token": csrf })).statusCode).toBe(403);
    await fixture.db.query("UPDATE users SET disabled_at = NULL WHERE id = $1", [user.id]);
    expect((await fixture.login(user.email, "replacement-456")).statusCode).toBe(401);
  });

  it("audits revocation of other sessions without revoking the current one", async () => {
    const user = await fixture.seed();
    const current = await fixture.login(user.email);
    await fixture.login(user.email);
    const response = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      headers: {
        origin,
        cookie: String(current.headers["set-cookie"]).split(";")[0]!,
        "x-csrf-token": String(current.headers["x-csrf-token"]),
      },
      payload: { currentPassword: "correct-password-123", newPassword: "replacement-456" },
    });
    expect(response.statusCode).toBe(200);
    const sessions = await fixture.db.query<{ id: string; revoked_at: Date | null }>(
      "SELECT id, revoked_at FROM sessions WHERE user_id = $1",
      [user.id],
    );
    expect(sessions.rows.filter((row) => row.revoked_at === null)).toHaveLength(1);
    const revoked = sessions.rows.find((row) => row.revoked_at !== null)!;
    const events = await fixture.db.query<{ request_id: string; actor_id: string }>(
      "SELECT request_id, actor_id FROM audit_events WHERE action = 'session.revoked' AND target_id = $1",
      [revoked.id],
    );
    expect(events.rows).toEqual([
      { request_id: response.headers["x-request-id"], actor_id: user.id },
    ]);
  });

  it("rejects an expired cookie and rate-limits the password route before loading the account", async () => {
    const user = await fixture.seed();
    const current = await fixture.login(user.email);
    const cookie = String(current.headers["set-cookie"]).split(";")[0]!;
    const headers = { origin, cookie, "x-csrf-token": String(current.headers["x-csrf-token"]) };
    const payload = { currentPassword: "correct-password-123", newPassword: "replacement-456" };
    await fixture.db.query(
      "UPDATE sessions SET expires_at = NOW() - interval '1 second' WHERE user_id = $1",
      [user.id],
    );
    expect(
      (await fixture.app.inject({ method: "POST", url: "/api/v1/me/password", headers, payload }))
        .statusCode,
    ).toBe(401);

    const limited = createServer({
      checkReadiness: async () => true,
      origin,
      logger: false,
      rateLimiter: { consume: async () => ({ allowed: false, retryAfterSeconds: 9 }) },
    });
    try {
      const response = await limited.inject({
        method: "POST",
        url: "/api/v1/me/password",
        headers: { origin, "x-csrf-token": "forged" },
        payload,
      });
      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBe("9");
    } finally {
      await limited.close();
    }
  });
});
