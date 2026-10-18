import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S15-T09: Abuse quotas, feature flags, and admin permissions (INT-11, NFR-07)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let adminUser: Awaited<ReturnType<typeof fixture.seed>>;
  let standardUser: Awaited<ReturnType<typeof fixture.seed>>;
  let adminHeaders: { origin: string; cookie: string; "x-csrf-token": string };
  let standardHeaders: { origin: string; cookie: string; "x-csrf-token": string };

  beforeAll(async () => {
    fixture = await createSessionFixture();

    // Standard user
    standardUser = await fixture.seed();
    const stdLogin = await fixture.login(standardUser.email);
    standardHeaders = {
      origin,
      cookie: String(stdLogin.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(stdLogin.headers["x-csrf-token"]),
    };

    // Admin user (using designated admin email)
    await fixture.db.query("DELETE FROM users WHERE email_normalized = 'admin@overleaf.local'");
    adminUser = await fixture.seed();
    await fixture.db.query("UPDATE users SET email_normalized = 'admin@overleaf.local' WHERE id = $1", [
      adminUser.id,
    ]);
    const admLogin = await fixture.login("admin@overleaf.local");
    expect(admLogin.statusCode).toBe(200);
    adminHeaders = {
      origin,
      cookie: String(admLogin.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(admLogin.headers["x-csrf-token"]),
    };
  });

  afterAll(async () => fixture.close());

  it("denies access to admin endpoints for non-admin users (403 Forbidden)", async () => {
    const endpoints = [
      "/api/v1/admin/users",
      "/api/v1/admin/quotas",
      "/api/v1/admin/flags",
    ];

    for (const url of endpoints) {
      const res = await fixture.app.inject({
        method: "GET",
        url,
        headers: standardHeaders,
      });
      expect(res.statusCode, `Denied for ${url}`).toBe(403);
    }
  });

  it("allows designated administrator to inspect and update system quotas and user status", async () => {
    // 1. Get quotas
    const quotasRes = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/admin/quotas",
      headers: adminHeaders,
    });
    expect(quotasRes.statusCode).toBe(200);
    expect(quotasRes.json().quotas.maxConcurrentCompilationsPerProject).toBeDefined();

    // 2. Update quotas
    const updateRes = await fixture.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/quotas",
      headers: adminHeaders,
      payload: { maxConcurrentCompilationsPerProject: 4 },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().quotas.maxConcurrentCompilationsPerProject).toBe(4);

    // 3. Suspend standard user for abuse
    const disableRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${standardUser.id}/disable`,
      headers: adminHeaders,
      payload: { disabled: true },
    });
    expect(disableRes.statusCode).toBe(200);
    expect(disableRes.json().disabled).toBe(true);

    // Reactivate
    const enableRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${standardUser.id}/disable`,
      headers: adminHeaders,
      payload: { disabled: false },
    });
    expect(enableRes.statusCode).toBe(200);
    expect(enableRes.json().disabled).toBe(false);
  });

  it("prevents enabling untrusted compilation without verified isolation evidence", async () => {
    delete process.env.G5_ISOLATION_VERIFIED;

    const flagRes = await fixture.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/flags",
      headers: adminHeaders,
      payload: { untrustedCompileEnabled: true },
    });
    expect(flagRes.statusCode).toBe(400);
    expect(flagRes.json().code).toBe("ISOLATION_REQUIRED");

    const signupRes = await fixture.app.inject({
      method: "PATCH",
      url: "/api/v1/admin/flags",
      headers: adminHeaders,
      payload: { publicSignupEnabled: true },
    });
    expect(signupRes.statusCode).toBe(400);
    expect(signupRes.json().code).toBe("ISOLATION_REQUIRED");
  });
});
