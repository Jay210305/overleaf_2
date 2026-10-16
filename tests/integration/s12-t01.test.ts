import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { AuthError } from "../../apps/api/src/modules/auth/errors.js";
import {
  decryptToken,
  type GitHubOAuthConfig,
} from "../../apps/api/src/modules/integrations/github-auth.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

loadEnvFile(".env");

const TEST_TOKEN = "gho_test_token_for_s12_t01_only";
const TEST_CONFIG: GitHubOAuthConfig = {
  clientId: "test-github-client-id",
  authorizationEndpoint: "https://github.test/login/oauth/authorize",
  tokenEndpoint: "https://github.test/login/oauth/access_token",
  callbackUrl: "http://127.0.0.1:5173/settings/integrations",
  scopes: ["repo"],
  encryptionKey: "test-encryption-key-min-16-chars!!",
};

describe("S12-T01 GitHub OAuth credential handling", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let csrf: string;
  let revoked: string[] = [];

  const authHeaders = (overrides: Record<string, string> = {}) => ({
    origin,
    cookie,
    "x-csrf-token": csrf,
    ...overrides,
  });

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    csrf = String(login.headers["x-csrf-token"]);
    revoked = [];
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      githubAuth: {
        config: TEST_CONFIG,
        exchangeCode: async ({ code }) => {
          if (code === "valid-code") return { accessToken: TEST_TOKEN, scope: "repo" };
          if (code === "rate-limited-code") throw new AuthError(429, "RATE_LIMITED");
          throw new AuthError(502, "PROVIDER_UNAVAILABLE");
        },
        revokeToken: async (token: string) => {
          revoked.push(token);
        },
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  const start = (headers: Record<string, string> = {}) =>
    app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/start",
      headers: authHeaders(headers),
    });
  const callback = (payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
    app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/callback",
      headers: authHeaders(headers),
      payload,
    });
  const status = (headers: Record<string, string> = {}) =>
    app.inject({
      method: "GET",
      url: "/api/v1/integrations/github/status",
      headers: authHeaders(headers),
    });
  const disconnect = (headers: Record<string, string> = {}) =>
    app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/disconnect",
      headers: authHeaders(headers),
    });

  it("starts an OAuth flow with PKCE challenge and single-use state", async () => {
    const response = await start();
    expect(response.statusCode).toBe(200);
    const body = response.json() as { authorizationUrl: string; state: string };
    expect(body.state.length).toBeGreaterThanOrEqual(32);
    const url = new URL(body.authorizationUrl);
    expect(url.origin).toBe("https://github.test");
    expect(url.searchParams.get("client_id")).toBe(TEST_CONFIG.clientId);
    expect(url.searchParams.get("state")).toBe(body.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")!.length).toBeGreaterThan(32);
    expect(JSON.stringify(body)).not.toContain(TEST_TOKEN);
  });

  it("denies start for bad sessions, origins and CSRF", async () => {
    expect((await start({ cookie: "session=invalid" })).statusCode).toBe(401);
    expect((await start({ origin: "https://evil.test" })).statusCode).toBe(403);
    expect((await start({ "x-csrf-token": "wrong" })).statusCode).toBe(403);
  });

  it("connects with a valid code and never returns the provider token", async () => {
    const state = (await start()).json() as { state: string };
    const response = await callback({ code: "valid-code", state: state.state });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { connectionId: string; provider: string; scopes: string[] };
    expect(body.connectionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.provider).toBe("github");
    expect(body.scopes).toEqual(["repo"]);
    expect(JSON.stringify(body)).not.toContain(TEST_TOKEN);
    const rows = await fixture.db.query<{ encrypted_credential_ref: string; scopes_json: unknown }>(
      "SELECT encrypted_credential_ref, scopes_json FROM external_connections WHERE id = $1",
      [body.connectionId],
    );
    expect(rows.rows[0]!.encrypted_credential_ref).not.toContain(TEST_TOKEN);
    expect(decryptToken(TEST_CONFIG.encryptionKey, rows.rows[0]!.encrypted_credential_ref)).toBe(
      TEST_TOKEN,
    );
  });

  it("rejects state replay, foreign states and invalid input", async () => {
    const state = (await start()).json() as { state: string };
    expect((await callback({ code: "valid-code", state: state.state })).statusCode).toBe(200);
    expect((await callback({ code: "valid-code", state: state.state })).statusCode).toBe(403);
    expect((await callback({ code: "valid-code", state: "a".repeat(43) })).statusCode).toBe(403);
    expect((await callback({ code: "", state: state.state })).statusCode).toBe(400);
    const other = (await start({ cookie: "session=invalid" })).statusCode;
    expect(other).toBe(401);
  });

  it("rejects a state bound to another user", async () => {
    const other = await fixture.seed();
    const otherLogin = await fixture.login(other.email);
    const otherHeaders = {
      origin,
      cookie: String(otherLogin.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(otherLogin.headers["x-csrf-token"]),
    };
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/start",
      headers: otherHeaders,
    });
    const { state } = started.json() as { state: string };
    expect((await callback({ code: "valid-code", state })).statusCode).toBe(403);
  });

  it("maps provider exchange failures without creating a connection", async () => {
    const before = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM external_connections WHERE provider = 'github'",
    );
    const state = (await start()).json() as { state: string };
    const failed = await callback({ code: "bad-code", state: state.state });
    expect(failed.statusCode).toBe(502);
    expect(JSON.stringify(failed.json())).not.toContain(TEST_TOKEN);
    const after = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM external_connections WHERE provider = 'github'",
    );
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
  });

  it("maps provider rate limits to 429 without creating a connection", async () => {
    const state = (await start()).json() as { state: string };
    const limited = await callback({ code: "rate-limited-code", state: state.state });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("reports status without tokens and disconnects with revocation", async () => {
    const state = (await start()).json() as { state: string };
    await callback({ code: "valid-code", state: state.state });
    const current = (await status()).json() as {
      connected: boolean;
      connectionId: string;
      scopes: string[];
    };
    expect(current.connected).toBe(true);
    expect(current.connectionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(current.scopes).toEqual(["repo"]);
    expect(JSON.stringify(current)).not.toContain(TEST_TOKEN);
    const removed = await disconnect();
    expect(removed.statusCode).toBe(200);
    expect(revoked).toEqual([TEST_TOKEN]);
    expect(((await status()).json() as { connected: boolean }).connected).toBe(false);
    expect((await disconnect()).statusCode).toBe(404);
  });

  it("answers CREDENTIALS_MISSING explicitly when unconfigured", async () => {
    const bare = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
    });
    try {
      const denied = await bare.inject({
        method: "POST",
        url: "/api/v1/integrations/github/start",
        headers: authHeaders(),
      });
      expect(denied.statusCode).toBe(503);
      expect(denied.json()).toMatchObject({ code: "CREDENTIALS_MISSING" });
      const idle = await bare.inject({
        method: "GET",
        url: "/api/v1/integrations/github/status",
        headers: authHeaders(),
      });
      expect(idle.json()).toEqual({ connected: false });
    } finally {
      await bare.close();
    }
  });
});
