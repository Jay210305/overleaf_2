import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { generateTotpCode, fromBase32 } from "../../../apps/api/src/modules/auth/mfa.js";

describe("ACC-06 S14-T07: Password change and MFA session invalidation regression", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("revokes other sessions when MFA is disabled", async () => {
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
    expect(setupRes.statusCode).toBe(200);
    const setup = setupRes.json();
    const base32Secret = new URL(setup.otpauthUri).searchParams.get("secret")!;

    // Confirm MFA
    const validCode = generateTotpCode(fromBase32(base32Secret));
    const confirmRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/confirm",
      headers: { origin, cookie: cookie1, "x-csrf-token": csrf1 },
      payload: { setupId: setup.setupId, code: validCode },
    });
    expect(confirmRes.statusCode).toBe(200);

    // Both sessions are still active
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { origin, cookie: cookie1 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { origin, cookie: cookie2 },
        })
      ).statusCode,
    ).toBe(200);

    // Disable MFA from session1
    const disableCode = generateTotpCode(fromBase32(base32Secret));
    const disableRes = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/me/mfa",
      headers: { origin, cookie: cookie1, "x-csrf-token": csrf1 },
      payload: { code: disableCode },
    });
    expect(disableRes.statusCode).toBe(204);

    // Session1 remains active
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { origin, cookie: cookie1 },
        })
      ).statusCode,
    ).toBe(200);

    // Session2 is revoked
    expect(
      (
        await fixture.app.inject({
          method: "GET",
          url: "/api/v1/auth/session",
          headers: { origin, cookie: cookie2 },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("rejects disabling MFA with an invalid code and preserves active sessions", async () => {
    const user = await fixture.seed();
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    // Setup & confirm MFA
    const setupRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/setup",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    const setup = setupRes.json();
    const base32Secret = new URL(setup.otpauthUri).searchParams.get("secret")!;
    const validCode = generateTotpCode(fromBase32(base32Secret));

    await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/confirm",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { setupId: setup.setupId, code: validCode },
    });

    // Attempt to disable with invalid code
    const invalidDisable = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/me/mfa",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { code: "999999" },
    });
    expect(invalidDisable.statusCode).toBe(403);
    expect(invalidDisable.json().code).toBe("INVALID_MFA_CODE");

    // Session remains active
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
});
