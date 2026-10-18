import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { generateTotpCode, fromBase32 } from "../../../apps/api/src/modules/auth/mfa.js";

describe("ACC-06 S14-T11: TOTP challenge, recovery codes, and session revocation regression", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("enforces single-use recovery code consumption and prevents reuse", async () => {
    const user = await fixture.seed();
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    // Setup MFA
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
    const recoveryCodes: string[] = confirmRes.json().recoveryCodes;
    expect(recoveryCodes.length).toBeGreaterThan(0);

    const recoveryCode1 = recoveryCodes[0]!;
    const recoveryCode2 = recoveryCodes[1]!;

    // Login using recoveryCode1
    const login1 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-csrf" },
      payload: { email: user.email, password: "correct-password-123", code: recoveryCode1 },
    });
    expect(login1.statusCode).toBe(200);

    // Reuse recoveryCode1 fails
    const loginReuse = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-csrf" },
      payload: { email: user.email, password: "correct-password-123", code: recoveryCode1 },
    });
    expect(loginReuse.statusCode).toBe(403);
    expect(loginReuse.json().code).toBe("INVALID_MFA_CODE");

    // Login using recoveryCode2 succeeds
    const login2 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-csrf" },
      payload: { email: user.email, password: "correct-password-123", code: recoveryCode2 },
    });
    expect(login2.statusCode).toBe(200);
  });

  it("disabling MFA requires challenge code and revokes all other sessions", async () => {
    const user = await fixture.seed();
    const session1 = await fixture.login(user.email);
    const session2 = await fixture.login(user.email);
    const cookie1 = String(session1.headers["set-cookie"]).split(";")[0]!;
    const csrf1 = String(session1.headers["x-csrf-token"]);
    const cookie2 = String(session2.headers["set-cookie"]).split(";")[0]!;

    // Setup MFA
    const setupRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/setup",
      headers: { origin, cookie: cookie1, "x-csrf-token": csrf1 },
    });
    const setup = setupRes.json();
    const base32 = new URL(setup.otpauthUri).searchParams.get("secret")!;
    const confirmCode = generateTotpCode(fromBase32(base32));

    await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/confirm",
      headers: { origin, cookie: cookie1, "x-csrf-token": csrf1 },
      payload: { setupId: setup.setupId, code: confirmCode },
    });

    // Attempt disable with invalid code -> rejected
    const badDisable = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/me/mfa",
      headers: { origin, cookie: cookie1, "x-csrf-token": csrf1 },
      payload: { code: "123456" },
    });
    expect(badDisable.statusCode).toBe(403);
    expect(badDisable.json().code).toBe("INVALID_MFA_CODE");

    // Disable with valid TOTP code
    const disableCode = generateTotpCode(fromBase32(base32));
    const goodDisable = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/me/mfa",
      headers: { origin, cookie: cookie1, "x-csrf-token": csrf1 },
      payload: { code: disableCode },
    });
    expect(goodDisable.statusCode).toBe(204);

    // Session 2 is revoked
    const checkSession2 = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { origin, cookie: cookie2 },
    });
    expect(checkSession2.statusCode).toBe(401);

    // Current session 1 is still valid
    const checkSession1 = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { origin, cookie: cookie1 },
    });
    expect(checkSession1.statusCode).toBe(200);
  });
});
