import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("ACC-04 S14-T07: Optional Google/GitHub OAuth identity link and unlink regression", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("links and unlinks Google identity without affecting other account properties", async () => {
    const user = await fixture.seed();
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);
    const googleSub = `google-sub-acc04-${randomUUID().slice(0, 8)}`;

    // Link Google identity
    const start = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/google/start",
      headers: { origin, cookie },
    });
    const state = new URL(start.json().redirectUrl).searchParams.get("state")!;

    const callback = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/auth/oauth/google/callback?code=mock:${googleSub}:${user.email}&state=${state}`,
      headers: { origin, cookie },
    });
    expect(callback.statusCode).toBe(200);

    const linked = await fixture.db.query<{ provider: string; provider_subject: string }>(
      "SELECT provider, provider_subject FROM auth_identities WHERE user_id = $1 AND provider = 'google'",
      [user.id],
    );
    expect(linked.rows).toHaveLength(1);
    expect(linked.rows[0]!.provider_subject).toBe(googleSub);

    // Unlink Google identity
    const unlink = await fixture.app.inject({
      method: "DELETE",
      url: "/api/v1/auth/oauth/google",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    expect(unlink.statusCode).toBe(204);

    const afterUnlink = await fixture.db.query(
      "SELECT id FROM auth_identities WHERE user_id = $1 AND provider = 'google'",
      [user.id],
    );
    expect(afterUnlink.rows).toHaveLength(0);
  });

  it("rejects OAuth login for disabled accounts", async () => {
    const disabledUser = await fixture.seed(true, true);
    const disabledSub = `gh-disabled-sub-${randomUUID().slice(0, 8)}`;
    await fixture.db.query(
      "INSERT INTO auth_identities (user_id, provider, provider_subject) VALUES ($1, 'github', $2)",
      [disabledUser.id, disabledSub],
    );

    const start = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/oauth/github/start",
      headers: { origin },
    });
    const state = new URL(start.json().redirectUrl).searchParams.get("state")!;

    const callback = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/auth/oauth/github/callback?code=mock:${disabledSub}:${disabledUser.email}&state=${state}`,
      headers: { origin },
    });
    expect(callback.statusCode).toBe(403);
    expect(callback.json().code).toBe("ACCOUNT_DISABLED");
  });

  it("rejects OAuth registration when public signup is disabled and account does not exist", async () => {
    const original = process.env.PUBLIC_SIGNUP_ENABLED;
    process.env.PUBLIC_SIGNUP_ENABLED = "false";
    try {
      const start = await fixture.app.inject({
        method: "GET",
        url: "/api/v1/auth/oauth/github/start",
        headers: { origin },
      });
      const state = new URL(start.json().redirectUrl).searchParams.get("state")!;

      const callback = await fixture.app.inject({
        method: "GET",
        url: `/api/v1/auth/oauth/github/callback?code=mock:gh-new-unknown:unknown-new@example.test&state=${state}`,
        headers: { origin },
      });
      expect(callback.statusCode).toBe(403);
      expect(callback.json().code).toBe("REGISTRATION_DENIED");
    } finally {
      process.env.PUBLIC_SIGNUP_ENABLED = original;
    }
  });
});
