import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("ACC-06 S02-T03 password-change revocation", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  const delivered: string[] = [];
  let failMail = false;
  beforeAll(async () => {
    fixture = await createSessionFixture(origin, false, async (_email, token) => {
      if (failMail) throw new Error("SMTP unavailable");
      delivered.push(token);
    });
  });
  afterAll(async () => {
    await fixture.close();
  });
  const forgot = (email: string) =>
    fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      headers: { origin, "x-csrf-token": "recovery-bootstrap" },
      payload: { email },
    });
  const reset = (token: string) =>
    fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      headers: { origin, "x-csrf-token": "recovery-bootstrap" },
      payload: { token, password: "replacement-password-123" },
    });

  it("revokes every existing session when a password is reset", async () => {
    const user = await fixture.seed();
    const first = await fixture.login(user.email);
    const second = await fixture.login(user.email);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((await forgot(user.email)).statusCode).toBe(202);
    expect((await reset(delivered.at(-1)!)).statusCode).toBe(200);
    const stored = await fixture.db.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM sessions WHERE user_id = $1",
      [user.id],
    );
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows.every((row) => row.revoked_at !== null)).toBe(true);
    for (const response of [first, second]) {
      const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
      expect(
        (
          await fixture.app.inject({
            method: "GET",
            url: "/api/v1/auth/session",
            headers: { origin, cookie },
          })
        ).statusCode,
      ).toBe(401);
    }
  });

  it("does not send recovery mail to unverified or disabled accounts", async () => {
    const unverified = await fixture.seed(false);
    const disabled = await fixture.seed(true, true);
    const count = delivered.length;
    const unknown = await forgot("unknown@example.test");
    const unverifiedResponse = await forgot(unverified.email);
    const disabledResponse = await forgot(disabled.email);
    expect([
      unknown.statusCode,
      unverifiedResponse.statusCode,
      disabledResponse.statusCode,
    ]).toEqual([202, 202, 202]);
    expect(unverifiedResponse.body).toBe(unknown.body);
    expect(disabledResponse.body).toBe(unknown.body);
    expect(delivered).toHaveLength(count);
  });

  it("denies redemption for an account disabled after token issue", async () => {
    const user = await fixture.seed();
    expect((await forgot(user.email)).statusCode).toBe(202);
    const token = delivered.at(-1)!;
    await fixture.db.query("UPDATE users SET disabled_at = NOW() WHERE id = $1", [user.id]);
    expect((await reset(token)).statusCode).toBe(403);
    const result = await fixture.db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id],
    );
    expect(await argon2.verify(result.rows[0]!.password_hash, "correct-password-123")).toBe(true);
  });

  it("returns the same accepted response when SMTP fails and invalidates the undelivered token", async () => {
    const user = await fixture.seed();
    failMail = true;
    try {
      const known = await forgot(user.email);
      const unknown = await forgot("nobody@example.test");
      expect(known.statusCode).toBe(202);
      expect(known.body).toBe(unknown.body);
      const active = await fixture.db.query<{ id: string }>(
        "SELECT id FROM verification_tokens WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL",
        [user.id],
      );
      expect(active.rows).toHaveLength(0);
    } finally {
      failMail = false;
    }
    expect((await forgot(user.email)).statusCode).toBe(202);
    expect((await reset(delivered.at(-1)!)).statusCode).toBe(200);
  });
});
