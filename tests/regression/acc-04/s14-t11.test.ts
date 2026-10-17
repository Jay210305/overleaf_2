import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { generateTotpCode, fromBase32 } from "../../../apps/api/src/modules/auth/mfa.js";

describe("ACC-04 S14-T11: OAuth linking/unlinking with active TOTP MFA regression", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("links OAuth identity on an MFA-enabled account and preserves MFA state", async () => {
    const user = await fixture.seed();
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    // 1. Enable MFA
    const setupRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/setup",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    expect(setupRes.statusCode).toBe(200);
    const setup = setupRes.json();
    const base32 = new URL(setup.otpauthUri).searchParams.get("secret")!;
    const confirmCode = generateTotpCode(fromBase32(base32));

    const confirmRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/confirm",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { setupId: setup.setupId, code: confirmCode },
    });
    expect(confirmRes.statusCode).toBe(200);

    // 2. Link Google OAuth identity
    const googleSub = `google-mfa-${randomUUID().slice(0, 8)}`;
    const start = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/google/start",
      headers: { origin, cookie },
    });
    expect(start.statusCode).toBe(200);
    const state = new URL(start.json().redirectUrl).searchParams.get("state")!;

    const callback = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/auth/oauth/google/callback?code=mock:${googleSub}:${user.email}&state=${state}`,
      headers: { origin, cookie },
    });
    expect(callback.statusCode).toBe(200);

    // 3. Verify MFA record still exists and is enabled
    const mfaRow = await fixture.db.query(
      "SELECT secret_encrypted FROM user_mfa WHERE user_id = $1",
      [user.id],
    );
    expect(mfaRow.rows).toHaveLength(1);

    // 4. Password login still enforces MFA
    const passwordLoginNoCode = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "csrf-test" },
      payload: { email: user.email, password: "correct-password-123" },
    });
    expect(passwordLoginNoCode.statusCode).toBe(403);
    expect(passwordLoginNoCode.json().code).toBe("MFA_CODE_REQUIRED");

    // 5. Unlink Google OAuth identity succeeds and preserves MFA
    const unlinkRes = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/auth/oauth/google",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    expect(unlinkRes.statusCode).toBe(204);

    const mfaRowAfter = await fixture.db.query(
      "SELECT secret_encrypted FROM user_mfa WHERE user_id = $1",
      [user.id],
    );
    expect(mfaRowAfter.rows).toHaveLength(1);
  });
});
