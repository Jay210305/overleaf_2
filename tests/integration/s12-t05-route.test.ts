import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import {
  encryptToken,
  type GitHubOAuthConfig,
} from "../../apps/api/src/modules/integrations/github-auth.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

const SHA = "a".repeat(40);
const CONFIG: GitHubOAuthConfig = {
  clientId: "test",
  authorizationEndpoint: "https://github.test/auth",
  tokenEndpoint: "https://github.test/token",
  callbackUrl: "http://127.0.0.1:5173/callback",
  scopes: ["repo"],
  encryptionKey: "test-encryption-key-min-16-chars!!",
};
let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
let app: ReturnType<typeof createServer>;
let projectId: string;
let cookie: string;
let csrf: string;

beforeAll(async () => {
  fixture = await createSessionFixture();
  await fixture.db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(80815)");
    for (const name of ["0013-github-sync-base.sql", "0015-github-sync-requests.sql"])
      await tx.query(
        readFileSync(resolve(import.meta.dirname, "../../packages/db/migrations", name), "utf8"),
      );
  });
  const owner = await fixture.seed();
  const login = await fixture.login(owner.email);
  cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  csrf = String(login.headers["x-csrf-token"]);
  const project = await createProject(fixture.db, owner.id, {
    title: "GitHub sync route",
    compiler: "pdflatex",
  });
  projectId = project.id;
  const connection = await fixture.db.query<{ id: string }>(
    `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
     VALUES ($1, 'github', $2, '[]'::jsonb, 'active') RETURNING id`,
    [owner.id, encryptToken(CONFIG.encryptionKey, "gho_test")],
  );
  await fixture.db.query(
    `INSERT INTO project_integrations (project_id, connection_id, provider, remote_ref, branch, sync_cursor)
     VALUES ($1, $2, 'github', 'octo/docs', 'main', $3)`,
    [projectId, connection.rows[0]!.id, SHA],
  );
  app = createServer({
    checkReadiness: async () => true,
    db: fixture.db,
    origin,
    logger: false,
    storage: {} as never,
    githubAuth: { config: CONFIG },
    githubSyncReader: {
      readTree: async () => ({ sha: SHA, defaultBranch: "main", entries: [] }),
      readFile: async () => new Uint8Array(),
    },
    githubPushWriter: {} as never,
    githubSyncInvalidations: { publish: async () => {} },
  });
});
afterAll(async () => {
  if (app) await app.close();
  if (fixture) await fixture.close();
});

it("requires session CSRF, freezes status, applies the exact revision, and replays its idempotency key", async () => {
  const base = `/api/v1/projects/${projectId}/integrations/github`;
  const headers = { origin, cookie, "x-csrf-token": csrf };
  expect(
    (await app.inject({ method: "POST", url: `${base}/status`, headers: { origin, cookie } }))
      .statusCode,
  ).toBe(403);
  const status = await app.inject({ method: "POST", url: `${base}/status`, headers });
  expect(status.statusCode).toBe(200);
  const plan = status.json() as {
    sourceRevisionId: string;
    remoteRevision: string;
    status: string;
  };
  expect(plan.remoteRevision).toBe(SHA);
  const payload = {
    direction: "pull",
    sourceRevisionId: plan.sourceRevisionId,
    expectedRemoteRevision: SHA,
  };
  expect(
    (
      await app.inject({
        method: "POST",
        url: `${base}/sync`,
        headers: { ...headers, "idempotency-key": "s12-t05-invalid-key-1234" },
        payload: { ...payload, force: true },
      })
    ).statusCode,
  ).toBe(400);
  const first = await app.inject({
    method: "POST",
    url: `${base}/sync`,
    headers: { ...headers, "idempotency-key": "s12-t05-retry-key-1234" },
    payload,
  });
  expect(first.statusCode).toBe(200);
  expect(first.json().status).toBe("succeeded");
  const second = await app.inject({
    method: "POST",
    url: `${base}/sync`,
    headers: { ...headers, "idempotency-key": "s12-t05-retry-key-1234" },
    payload,
  });
  expect(second.statusCode).toBe(200);
  expect(second.json()).toEqual(first.json());
});
