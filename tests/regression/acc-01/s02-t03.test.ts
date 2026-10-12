import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("ACC-01 S02-T03 reset-token denials", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  const delivered: string[] = [];
  beforeAll(async () => {
    fixture = await createSessionFixture(origin, false, async (_email, token) => {
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
  const reset = (
    token: string,
    body: Record<string, unknown> = { token, password: "replacement-password-123" },
  ) =>
    fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      headers: { origin, "x-csrf-token": "recovery-bootstrap" },
      payload: body,
    });

  it("rejects an expired token without changing the password or an active session", async () => {
    const user = await fixture.seed();
    const login = await fixture.login(user.email);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    expect((await forgot(user.email)).statusCode).toBe(202);
    const token = delivered.at(-1)!;
    await fixture.db.query(
      "UPDATE verification_tokens SET expires_at = NOW() - interval '1 second' WHERE token_hash = $1",
      [createHash("sha256").update(token).digest("hex")],
    );
    expect((await reset(token)).statusCode).toBe(401);
    expect((await fixture.login(user.email)).statusCode).toBe(200);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/auth/session",
          headers: { origin, cookie },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("rejects malformed reset data without consuming a valid token", async () => {
    const user = await fixture.seed();
    expect((await forgot(user.email)).statusCode).toBe(202);
    const token = delivered.at(-1)!;
    expect((await reset(token, { token, password: "short" })).statusCode).toBe(400);
    expect(
      (await reset(token, { token, password: "replacement-password-123", role: "admin" }))
        .statusCode,
    ).toBe(400);
    expect((await reset(token)).statusCode).toBe(200);
  });

  it("allows exactly one concurrent redemption of a reset token", async () => {
    const user = await fixture.seed();
    expect((await forgot(user.email)).statusCode).toBe(202);
    const token = delivered.at(-1)!;
    const [first, second] = await Promise.all([reset(token), reset(token)]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 401]);
  });

  it("invalidates an earlier unused reset link when a new one is issued", async () => {
    const user = await fixture.seed();
    expect((await forgot(user.email)).statusCode).toBe(202);
    const first = delivered.at(-1)!;
    expect((await forgot(user.email)).statusCode).toBe(202);
    const second = delivered.at(-1)!;
    expect(second).not.toBe(first);
    expect((await reset(first)).statusCode).toBe(401);
    expect((await reset(second)).statusCode).toBe(200);
  });
});
