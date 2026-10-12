import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("ACC-02 S02-T08 session revocation and token reuse", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  const delivered: string[] = [];

  beforeAll(async () => {
    fixture = await createSessionFixture(origin, false, async (_email, token) => {
      delivered.push(token);
    });
  });
  afterAll(async () => fixture.close());

  it("invalidates the previous cookie and CSRF pair during rotation and after logout", async () => {
    const user = await fixture.seed();
    const login = await fixture.login(user.email);
    expect(login.statusCode).toBe(200);
    const oldCookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const oldCsrf = String(login.headers["x-csrf-token"]);
    const rotated = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { origin, cookie: oldCookie },
    });
    expect(rotated.statusCode).toBe(200);
    const newCookie = String(rotated.headers["set-cookie"]).split(";")[0]!;
    const newCsrf = String(rotated.headers["x-csrf-token"]);
    expect(newCookie).not.toBe(oldCookie);
    expect(newCsrf).not.toBe(oldCsrf);
    const profile = (cookie: string) =>
      fixture.app.inject({ method: "GET", url: "/api/v1/me", headers: { origin, cookie } });
    expect((await profile(oldCookie)).statusCode).toBe(401);
    expect((await profile(newCookie)).statusCode).toBe(200);
    const logout = (csrf: string) =>
      fixture.app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { origin, cookie: newCookie, "x-csrf-token": csrf },
      });
    expect((await logout(oldCsrf)).statusCode).toBe(403);
    expect((await profile(newCookie)).statusCode).toBe(200);
    expect((await logout(newCsrf)).statusCode).toBe(204);
    expect((await profile(newCookie)).statusCode).toBe(401);
  });

  it("does not consume recovery tokens on forged Origin and denies a consumed token", async () => {
    const user = await fixture.seed();
    const login = await fixture.login(user.email);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const forgot = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/password/forgot",
      headers: { origin, "x-csrf-token": "recovery-bootstrap" },
      payload: { email: user.email },
    });
    expect(forgot.statusCode).toBe(202);
    const token = delivered.at(-1)!;
    const reset = (requestOrigin: string) =>
      fixture.app.inject({
        method: "POST",
        url: "/api/v1/auth/password/reset",
        headers: { origin: requestOrigin, "x-csrf-token": "recovery-bootstrap" },
        payload: { token, password: "replacement-password-456" },
      });
    expect((await reset("https://foreign.example")).statusCode).toBe(403);
    expect((await reset(origin)).statusCode).toBe(200);
    expect((await reset(origin)).statusCode).toBe(401);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { origin, cookie },
        })
      ).statusCode,
    ).toBe(401);
  });
});
