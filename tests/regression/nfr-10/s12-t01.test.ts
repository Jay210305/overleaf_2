import { createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

loadEnvFile(".env");

const TEST_TOKEN = "gho_nfr10_token_must_never_leak";

/**
 * NFR-10 scoped slice of S12-T01: no credentials, tokens or private source
 * content in application logs or browser-visible payloads.
 */
describe("S12-T01 NFR-10 no provider token in logs or payloads", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let csrf: string;
  const logged: string[] = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    csrf = String(login.headers["x-csrf-token"]);
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: { level: "info", stream: { write: (chunk: string) => void logged.push(chunk) } },
      githubAuth: {
        config: {
          clientId: "test-client",
          authorizationEndpoint: "https://github.test/authorize",
          tokenEndpoint: "https://github.test/token",
          callbackUrl: "http://127.0.0.1:5173/settings/integrations",
          scopes: ["repo"],
          encryptionKey: "nfr10-encryption-key-16!!!",
        },
        exchangeCode: async () => ({ accessToken: TEST_TOKEN, scope: "repo" }),
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  it("keeps the token out of every response body and the log stream", async () => {
    const headers = { origin, cookie, "x-csrf-token": csrf };
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/start",
      headers,
    });
    expect(started.statusCode).toBe(200);
    const { state } = started.json() as { state: string };
    const connected = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/callback",
      headers,
      payload: { code: "valid-code", state },
    });
    expect(connected.statusCode).toBe(200);
    const current = await app.inject({
      method: "GET",
      url: "/api/v1/integrations/github/status",
      headers,
    });
    expect(current.statusCode).toBe(200);
    const removed = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/disconnect",
      headers,
    });
    expect(removed.statusCode).toBe(200);
    for (const body of [started.body, connected.body, current.body, removed.body]) {
      expect(body).not.toContain(TEST_TOKEN);
      expect(body).not.toContain(createHash("sha256").update(TEST_TOKEN).digest("hex"));
    }
    expect(logged.join("\n")).not.toContain(TEST_TOKEN);
    const all = await fixture.db.query<{ encrypted_credential_ref: string }>(
      "SELECT encrypted_credential_ref FROM external_connections",
    );
    for (const row of all.rows) expect(row.encrypted_credential_ref).not.toContain(TEST_TOKEN);
  });
});
