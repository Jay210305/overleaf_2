import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { generateTotpCode, fromBase32 } from "../../apps/api/src/modules/auth/mfa.js";

describe("S14-T11: Optional TOTP challenge and single-use recovery slice integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("enforces MFA challenge on login when MFA is enabled", async () => {
    const user = await fixture.seed();
    const loginInitial = await fixture.login(user.email);
    expect(loginInitial.statusCode).toBe(200);
    const cookie = String(loginInitial.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(loginInitial.headers["x-csrf-token"]);

    // 1. Setup and confirm MFA
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
    expect(recoveryCodes).toHaveLength(8);

    // 2. Login without code -> 403 MFA_CODE_REQUIRED
    const loginNoCode = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email: user.email, password: "correct-password-123" },
    });
    expect(loginNoCode.statusCode).toBe(403);
    expect(loginNoCode.json().code).toBe("MFA_CODE_REQUIRED");

    // 3. Login with invalid code -> 403 INVALID_MFA_CODE
    const loginBadCode = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email: user.email, password: "correct-password-123", code: "000000" },
    });
    expect(loginBadCode.statusCode).toBe(403);
    expect(loginBadCode.json().code).toBe("INVALID_MFA_CODE");

    // 4. Login with valid TOTP code -> 200
    const validCode = generateTotpCode(fromBase32(base32));
    const loginTotp = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email: user.email, password: "correct-password-123", code: validCode },
    });
    expect(loginTotp.statusCode).toBe(200);
    expect(loginTotp.headers["set-cookie"]).toBeDefined();

    // 5. Login with single-use recovery code -> 200
    const singleUseCode = recoveryCodes[0]!;
    const loginRecovery1 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email: user.email, password: "correct-password-123", code: singleUseCode },
    });
    expect(loginRecovery1.statusCode).toBe(200);

    // 6. Reuse of the same recovery code is rejected
    const loginRecovery2 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email: user.email, password: "correct-password-123", code: singleUseCode },
    });
    expect(loginRecovery2.statusCode).toBe(403);
    expect(loginRecovery2.json().code).toBe("INVALID_MFA_CODE");
  });

  it("disabling MFA requires valid challenge and revokes active sessions", async () => {
    const user = await fixture.seed();
    const sessionA = await fixture.login(user.email);
    const sessionB = await fixture.login(user.email);
    const cookieA = String(sessionA.headers["set-cookie"]).split(";")[0]!;
    const csrfA = String(sessionA.headers["x-csrf-token"]);
    const cookieB = String(sessionB.headers["set-cookie"]).split(";")[0]!;

    // Setup MFA
    const setupRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/setup",
      headers: { origin, cookie: cookieA, "x-csrf-token": csrfA },
    });
    const setup = setupRes.json();
    const base32 = new URL(setup.otpauthUri).searchParams.get("secret")!;
    const code = generateTotpCode(fromBase32(base32));

    await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/confirm",
      headers: { origin, cookie: cookieA, "x-csrf-token": csrfA },
      payload: { setupId: setup.setupId, code },
    });

    // Disable with valid TOTP code
    const disableCode = generateTotpCode(fromBase32(base32));
    const disableRes = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/me/mfa",
      headers: { origin, cookie: cookieA, "x-csrf-token": csrfA },
      payload: { code: disableCode },
    });
    expect(disableRes.statusCode).toBe(204);

    // SessionB is revoked
    const checkB = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { origin, cookie: cookieB },
    });
    expect(checkB.statusCode).toBe(401);

    // Login without code works again since MFA was disabled
    const loginAgain = await fixture.login(user.email);
    expect(loginAgain.statusCode).toBe(200);
  });
});
