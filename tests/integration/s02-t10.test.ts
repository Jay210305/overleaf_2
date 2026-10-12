import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S02-T10 authenticated password change", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => fixture.close());

  it("changes the Argon2id password and revokes other sessions while retaining the current session", async () => {
    const user = await fixture.seed();
    const current = await fixture.login(user.email);
    const other = await fixture.login(user.email);
    const cookie = String(current.headers["set-cookie"]).split(";")[0]!;
    const otherCookie = String(other.headers["set-cookie"]).split(";")[0]!;
    const changed = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      headers: { origin, cookie, "x-csrf-token": String(current.headers["x-csrf-token"]) },
      payload: { currentPassword: "correct-password-123", newPassword: "new-password-456" },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ accepted: true });
    const stored = await fixture.db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id],
    );
    expect(stored.rows[0]!.password_hash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(stored.rows[0]!.password_hash, "new-password-456")).toBe(true);
    expect(
      (await fixture.app.inject({ method: "GET", url: "/api/v1/me", headers: { origin, cookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { origin, cookie: otherCookie },
        })
      ).statusCode,
    ).toBe(401);
    expect((await fixture.login(user.email)).statusCode).toBe(401);
    expect((await fixture.login(user.email, "new-password-456")).statusCode).toBe(200);
  });
});
