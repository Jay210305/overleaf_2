import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { generateTotpCode, fromBase32 } from "../../apps/api/src/modules/auth/mfa.js";

describe("S14-T07: Safe social OAuth account linking and MFA boundary", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("rejects unsupported OAuth providers with 422 CAPABILITY_UNSUPPORTED", async () => {
    const res = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/mendeley/start",
      headers: { origin },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe("CAPABILITY_UNSUPPORTED");
  });

  it("starts OAuth flow with valid state, PKCE code challenge and redirect URL", async () => {
    const res = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/google/start",
      headers: { origin },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.redirectUrl).toBeDefined();
    expect(body.redirectUrl).toContain("accounts.google.com");
    expect(body.redirectUrl).toContain("code_challenge=");
    expect(body.redirectUrl).toContain("code_challenge_method=S256");
    expect(body.redirectUrl).toContain("state=");
  });

  it("links Google/GitHub identity to an authenticated account", async () => {
    const user = await fixture.seed();
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const sub = `gh-sub-${randomUUID().slice(0, 8)}`;

    // Start OAuth while authenticated
    const startRes = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/github/start",
      headers: { origin, cookie },
    });
    expect(startRes.statusCode).toBe(200);
    const redirectUrl = new URL(startRes.json().redirectUrl);
    const state = redirectUrl.searchParams.get("state")!;
    expect(state).toBeDefined();

    // Callback with mock code
    const cbRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/auth/oauth/github/callback?code=mock:${sub}:${user.email}&state=${state}`,
      headers: { origin, cookie },
    });
    expect(cbRes.statusCode).toBe(200);
    expect(cbRes.json().id).toBe(user.id);

    // Verify identity in DB
    const idRow = await fixture.db.query<{ provider: string; provider_subject: string }>(
      "SELECT provider, provider_subject FROM auth_identities WHERE user_id = $1",
      [user.id],
    );
    expect(idRow.rows.some((r) => r.provider === "github" && r.provider_subject === sub)).toBe(
      true,
    );

    // Verify identities list endpoint
    const listRes = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/identities",
      headers: { origin, cookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "github", providerSubject: sub }),
      ]),
    );
  });

  it("protects existing account association: rejects linking identity already linked to another account with 409", async () => {
    const userA = await fixture.seed();
    const userB = await fixture.seed();
    const conflictSub = `gh-sub-conflict-${randomUUID().slice(0, 8)}`;

    // Link conflictSub to userA
    await fixture.db.query(
      "INSERT INTO auth_identities (user_id, provider, provider_subject) VALUES ($1, 'github', $2)",
      [userA.id, conflictSub],
    );

    // Now userB attempts to link the same conflictSub
    const sessionB = await fixture.login(userB.email);
    const cookieB = String(sessionB.headers["set-cookie"]).split(";")[0]!;

    const startRes = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/github/start",
      headers: { origin, cookie: cookieB },
    });
    const state = new URL(startRes.json().redirectUrl).searchParams.get("state")!;

    const cbRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/auth/oauth/github/callback?code=mock:${conflictSub}:foreign@example.test&state=${state}`,
      headers: { origin, cookie: cookieB },
    });
    expect(cbRes.statusCode).toBe(409);
    expect(cbRes.json().code).toBe("IDENTITY_ALREADY_LINKED");
  });

  it("safely unlinks social identity and prevents unlinking when no other authentication method exists", async () => {
    // User with password and one oauth identity can unlink
    const user = await fixture.seed();
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);
    const googleSub = `g-unlink-${randomUUID().slice(0, 8)}`;

    await fixture.db.query(
      "INSERT INTO auth_identities (user_id, provider, provider_subject) VALUES ($1, 'google', $2)",
      [user.id, googleSub],
    );

    // Unlink google
    const unlinkRes = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/auth/oauth/google",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    expect(unlinkRes.statusCode).toBe(204);

    // Identity removed from DB
    const check = await fixture.db.query(
      "SELECT id FROM auth_identities WHERE user_id = $1 AND provider = 'google'",
      [user.id],
    );
    expect(check.rows).toHaveLength(0);

    // User without password and only one identity cannot unlink
    const uniqueNoPassEmail = `nopass-${randomUUID().slice(0, 8)}@example.test`;
    const noPassUserRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
       VALUES ($1, 'No Pass', NULL, NOW()) RETURNING id`,
      [uniqueNoPassEmail],
    );
    const noPassUserId = noPassUserRes.rows[0]!.id;
    const onlyOneSub = `g-only-one-${randomUUID().slice(0, 8)}`;
    await fixture.db.query(
      "INSERT INTO auth_identities (user_id, provider, provider_subject) VALUES ($1, 'google', $2)",
      [noPassUserId, onlyOneSub],
    );

    // Sign in via OAuth callback for this user
    const start = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/google/start",
      headers: { origin },
    });
    const state = new URL(start.json().redirectUrl).searchParams.get("state")!;
    const loginRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/auth/oauth/google/callback?code=mock:${onlyOneSub}:${uniqueNoPassEmail}&state=${state}`,
      headers: { origin },
    });
    expect(loginRes.statusCode).toBe(200);
    const noPassCookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    const noPassCsrf = String(loginRes.headers["x-csrf-token"]);

    // Attempt to unlink only auth method
    const deniedUnlink = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/auth/oauth/google",
      headers: { origin, cookie: noPassCookie, "x-csrf-token": noPassCsrf },
    });
    expect(deniedUnlink.statusCode).toBe(409);
    expect(deniedUnlink.json().code).toBe("CANNOT_UNLINK_LAST_AUTH_METHOD");
  });

  it("handles MFA setup, verification, and revocation on disable", async () => {
    const user = await fixture.seed();
    const session = await fixture.login(user.email);
    const otherSession = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);
    const otherCookie = String(otherSession.headers["set-cookie"]).split(";")[0]!;

    // POST /api/v1/me/mfa/setup
    const setupRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/setup",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    expect(setupRes.statusCode).toBe(200);
    const setup = setupRes.json();
    expect(setup.setupId).toBeDefined();
    expect(setup.otpauthUri).toContain("otpauth://totp/");

    // Extract secret from otpauthUri
    const otpUri = new URL(setup.otpauthUri);
    const base32Secret = otpUri.searchParams.get("secret")!;
    expect(base32Secret).toBeDefined();

    // Verify with invalid code first
    const badConfirm = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/confirm",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { setupId: setup.setupId, code: "000000" },
    });
    expect(badConfirm.statusCode).toBe(400);

    // Verify with valid TOTP code
    const validCode = generateTotpCode(fromBase32(base32Secret));

    const confirmRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/mfa/confirm",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { setupId: setup.setupId, code: validCode },
    });
    expect(confirmRes.statusCode).toBe(200);
    const confirmBody = confirmRes.json();
    expect(confirmBody.accepted).toBe(true);
    expect(confirmBody.recoveryCodes).toHaveLength(8);

    // Disable MFA with valid code
    const disableCode = generateTotpCode(fromBase32(base32Secret));
    const disableRes = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/me/mfa",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { code: disableCode },
    });
    expect(disableRes.statusCode).toBe(204);

    // Other session was revoked upon disabling MFA
    const otherCheck = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { origin, cookie: otherCookie },
    });
    expect(otherCheck.statusCode).toBe(401);
  });
});
