import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("S02-T10 password change denial and recovery token regression", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => fixture.close());

  it("rejects an incorrect current password without changing the hash or other sessions", async () => {
    const user = await fixture.seed();
    const current = await fixture.login(user.email);
    const other = await fixture.login(user.email);
    const before = await fixture.db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id],
    );
    const response = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      headers: {
        origin,
        cookie: String(current.headers["set-cookie"]).split(";")[0]!,
        "x-csrf-token": String(current.headers["x-csrf-token"]),
      },
      payload: { currentPassword: "wrong-password-123", newPassword: "replacement-456" },
    });
    expect(response.statusCode).toBe(403);
    const after = await fixture.db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id],
    );
    expect(after.rows[0]!.password_hash).toBe(before.rows[0]!.password_hash);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { origin, cookie: String(other.headers["set-cookie"]).split(";")[0]! },
        })
      ).statusCode,
    ).toBe(200);
    expect((await fixture.login(user.email, "replacement-456")).statusCode).toBe(401);
  });

  it("invalidates unused recovery tokens after a successful authenticated change", async () => {
    const user = await fixture.seed();
    const current = await fixture.login(user.email);
    const token = randomBytes(32).toString("base64url");
    await fixture.db.query(
      "INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'password_reset', $2, NOW() + interval '1 hour')",
      [user.id, createHash("sha256").update(token).digest("hex")],
    );
    const changed = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      headers: {
        origin,
        cookie: String(current.headers["set-cookie"]).split(";")[0]!,
        "x-csrf-token": String(current.headers["x-csrf-token"]),
      },
      payload: { currentPassword: "correct-password-123", newPassword: "replacement-456" },
    });
    expect(changed.statusCode).toBe(200);
    const used = await fixture.db.query<{ used_at: Date | null }>(
      "SELECT used_at FROM verification_tokens WHERE token_hash = $1",
      [createHash("sha256").update(token).digest("hex")],
    );
    expect(used.rows[0]!.used_at).not.toBeNull();
    const reset = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/password/reset",
      headers: { origin, "x-csrf-token": "recovery-bootstrap" },
      payload: { token, password: "stolen-password-789" },
    });
    expect(reset.statusCode).toBe(401);
    const stored = await fixture.db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id],
    );
    expect(await argon2.verify(stored.rows[0]!.password_hash, "replacement-456")).toBe(true);
  });
});
