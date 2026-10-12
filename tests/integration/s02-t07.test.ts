import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { tokenHash } from "../../apps/api/src/modules/auth/errors.js";

describe("S02-T07 persisted profile and session management", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => fixture.close());

  it("persists profile and preferences across requests and rejects malformed or forged writes", async () => {
    const user = await fixture.seed();
    const signed = await fixture.login(user.email);
    expect(signed.statusCode).toBe(200);
    const cookie = String(signed.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(signed.headers["x-csrf-token"]);
    const call = (
      method: "GET" | "PATCH",
      url: string,
      payload?: object,
      requestOrigin = origin,
      suppliedCsrf = csrf,
    ) =>
      fixture.app.inject({
        method,
        url,
        headers: { origin: requestOrigin, cookie, "x-csrf-token": suppliedCsrf },
        ...(payload ? { payload } : {}),
      });
    expect((await call("GET", "/api/v1/me")).json().email).toBe(user.email);
    const profile = await call("PATCH", "/api/v1/me", { displayName: "Updated Writer" });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().displayName).toBe("Updated Writer");
    const saved = await call("PATCH", "/api/v1/me/preferences", {
      locale: "es-PE",
      timezone: "America/Lima",
      theme: "dark",
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      locale: "es-PE",
      timezone: "America/Lima",
      theme: "dark",
    });
    expect((await call("GET", "/api/v1/me/preferences")).json()).toMatchObject({
      locale: "es-PE",
      timezone: "America/Lima",
      theme: "dark",
    });
    expect((await call("GET", "/api/v1/me")).json()).toMatchObject({
      displayName: "Updated Writer",
      locale: "es-PE",
      timezone: "America/Lima",
    });
    expect((await call("PATCH", "/api/v1/me/preferences", { theme: "neon" })).statusCode).toBe(400);
    expect(
      (await call("PATCH", "/api/v1/me/preferences", { theme: "light" }, "https://foreign.example"))
        .statusCode,
    ).toBe(403);
    expect(
      (await call("PATCH", "/api/v1/me/preferences", { theme: "light" }, origin, "forged-csrf"))
        .statusCode,
    ).toBe(403);
    expect((await call("GET", "/api/v1/me/preferences")).json().theme).toBe("dark");
    const editor = {
      fontFamily: "monospace",
      fontSize: 16,
      tabWidth: 4,
      wrap: true,
      autoClose: true,
      autocomplete: false,
      reducedMotion: true,
    };
    const notifications = {
      email: false,
      inApp: true,
      mentions: true,
      replies: false,
      invitations: true,
    };
    const advanced = await call("PATCH", "/api/v1/me/preferences", { editor, notifications });
    expect(advanced.statusCode).toBe(200);
    expect((await call("GET", "/api/v1/me/preferences")).json()).toMatchObject({
      editor,
      notifications,
    });
    expect(
      (await call("PATCH", "/api/v1/me/preferences", { theme: "dark", source: "private-tex" }))
        .statusCode,
    ).toBe(400);
  });

  it("lists own sessions, hides foreign sessions, and revokes a selected session", async () => {
    const owner = await fixture.seed();
    const foreign = await fixture.seed();
    const first = await fixture.login(owner.email);
    const second = await fixture.login(owner.email);
    const other = await fixture.login(foreign.email);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(other.statusCode).toBe(200);
    const cookie = String(first.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(first.headers["x-csrf-token"]);
    const headers = { origin, cookie, "x-csrf-token": csrf };
    const list = await fixture.app.inject({ method: "GET", url: "/api/v1/me/sessions", headers });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(2);
    const target = list.json().items.find((item: { current: boolean }) => !item.current).id;
    const foreignId = (
      await fixture.db.query<{ id: string }>(
        "SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [foreign.id],
      )
    ).rows[0]!.id;
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/me/sessions/${foreignId}`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/me/sessions/${randomUUID()}`,
          headers: { ...headers, "x-csrf-token": "forged-csrf" },
        })
      ).statusCode,
    ).toBe(403);
    const revoked = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/me/sessions/${target}`,
      headers,
    });
    expect(revoked.statusCode).toBe(204);
    expect(
      (await fixture.app.inject({ method: "GET", url: "/api/v1/me/sessions", headers })).json()
        .items,
    ).toHaveLength(1);
    const secondCookie = String(second.headers["set-cookie"]).split(";")[0]!;
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { origin, cookie: secondCookie },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("denies expired sessions and disabled accounts without exposing profile data", async () => {
    const expiredUser = await fixture.seed();
    const expiredLogin = await fixture.login(expiredUser.email);
    const expiredCookie = String(expiredLogin.headers["set-cookie"]).split(";")[0]!;
    await fixture.db.query(
      "UPDATE sessions SET expires_at = NOW() - interval '1 second' WHERE token_hash = $1",
      [tokenHash(expiredCookie.split("=")[1]!)],
    );
    const expired = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { origin, cookie: expiredCookie },
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.body).not.toContain(expiredUser.email);
    const disabledUser = await fixture.seed();
    const disabledLogin = await fixture.login(disabledUser.email);
    const disabledCookie = String(disabledLogin.headers["set-cookie"]).split(";")[0]!;
    await fixture.db.query("UPDATE users SET disabled_at = NOW() WHERE id = $1", [disabledUser.id]);
    const disabled = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me/preferences",
      headers: { origin, cookie: disabledCookie },
    });
    expect(disabled.statusCode).toBe(403);
    expect(disabled.body).not.toContain(disabledUser.email);
  });
});
