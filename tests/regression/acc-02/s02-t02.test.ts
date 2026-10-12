import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("ACC-02 S02-T02 CSRF and expiry", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => {
    await fixture.close();
  });

  it("rejects forged logout while preserving the real session", async () => {
    const user = await fixture.seed();
    const issued = await fixture.login(user.email);
    const cookie = String(issued.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(issued.headers["x-csrf-token"]);
    const post = (requestOrigin: string, header: string) =>
      fixture.app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie, origin: requestOrigin, "x-csrf-token": header },
      });
    expect((await post("https://foreign.example", csrf)).statusCode).toBe(403);
    expect((await post(origin, "forged-csrf-token-value-1234567890")).statusCode).toBe(403);
    expect((await post(origin, csrf)).statusCode).toBe(204);
    expect((await post(origin, csrf)).statusCode).toBe(401);
  });

  it("enforces the absolute 30-day limit even if the idle expiry is in the future", async () => {
    const user = await fixture.seed();
    const issued = await fixture.login(user.email);
    const cookie = String(issued.headers["set-cookie"]).split(";")[0]!;
    const token = cookie.split("=")[1]!;
    await fixture.db.query(
      "UPDATE sessions SET created_at = NOW() - interval '31 days', expires_at = NOW() + interval '1 day' WHERE token_hash = $1",
      [createHash("sha256").update(token).digest("hex")],
    );
    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie, origin },
    });
    expect(response.statusCode).toBe(401);
  });

  it("denies a disabled account after login and rejects ambiguous cookies", async () => {
    const user = await fixture.seed();
    const issued = await fixture.login(user.email);
    const cookie = String(issued.headers["set-cookie"]).split(";")[0]!;
    const duplicate = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: `${cookie}; ${cookie}`, origin },
    });
    expect(duplicate.statusCode).toBe(401);
    await fixture.db.query("UPDATE users SET disabled_at = NOW() WHERE id = $1", [user.id]);
    const denied = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie, origin },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: "ACCOUNT_DISABLED" });
  });

  it("does not authenticate a legacy session without a CSRF binding", async () => {
    const user = await fixture.seed();
    const issued = await fixture.login(user.email);
    const cookie = String(issued.headers["set-cookie"]).split(";")[0]!;
    const token = cookie.split("=")[1]!;
    await fixture.db.query("UPDATE sessions SET csrf_hash = NULL WHERE token_hash = $1", [
      createHash("sha256").update(token).digest("hex"),
    ]);
    const denied = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie, origin },
    });
    expect(denied.statusCode).toBe(401);
  });

  it("uses the __Host prefix and Secure flag under HTTPS", async () => {
    const https = await createSessionFixture("https://app.example.test", true);
    try {
      const user = await https.seed();
      const response = await https.login(user.email);
      expect(response.statusCode).toBe(200);
      expect(String(response.headers["set-cookie"])).toMatch(
        /^__Host-latex_session=.*; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/,
      );
    } finally {
      await https.close();
    }
  });
});
