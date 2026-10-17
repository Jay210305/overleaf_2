import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import {
  encryptToken,
  type GitHubOAuthConfig,
} from "../../apps/api/src/modules/integrations/github-auth.js";
import type { GitHubApplyReader } from "../../apps/jobs/src/sync/apply-changes.js";
import type { RemoteTree } from "../../apps/jobs/src/sync/github-pull.js";
import type { GitHubPushWriter } from "../../apps/jobs/src/sync/github-push.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

/**
 * S12-T07 authorized-route failure verification (INT-05).
 *
 * Drives the real `POST …/integrations/github/status` and `…/sync` routes with
 * a controllable provider port so the sync pipeline is exercised end to end
 * (session, CSRF, role, link, idempotency, pull/apply/push). An expired token,
 * a stale expected SHA, a remote advance and a non-fast-forward ref update all
 * fail with the typed HTTP status and never leave a fake synced cursor.
 */

const SHA = "a".repeat(40);
const COMMIT = "c".repeat(40);
const CONFIG: GitHubOAuthConfig = {
  clientId: "test",
  authorizationEndpoint: "https://github.test/auth",
  tokenEndpoint: "https://github.test/token",
  callbackUrl: "http://127.0.0.1:5173/callback",
  scopes: ["repo"],
  encryptionKey: "test-encryption-key-min-16-chars!!",
};

describe("S12-T07 authorized GitHub sync routes", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let projectId: string;
  let connectionId: string;
  let cookie: string;
  let csrf: string;

  let tree: RemoteTree = { sha: SHA, defaultBranch: "main", entries: [] };
  let updateError: string | null = null;
  const files = new Map<string, Uint8Array>();
  let head = SHA;

  const reader: GitHubApplyReader = {
    readTree: async () => tree,
    readFile: async (_token, _repo, _branch, path) => {
      const bytes = files.get(path);
      if (!bytes) throw { code: "RESOURCE_NOT_FOUND" };
      return bytes;
    },
  };
  const writer: GitHubPushWriter = {
    readHead: async () => ({ sha: head, treeSha: "2".repeat(40) }),
    writeBlob: async () => "d".repeat(40),
    writeTree: async () => "b".repeat(40),
    writeCommit: async () => COMMIT,
    updateBranch: async (_token, _repo, _branch, commit) => {
      if (updateError) throw { code: updateError };
      head = commit;
    },
  };

  const headers = () => ({ origin, cookie, "x-csrf-token": csrf });
  const base = () => `/api/v1/projects/${projectId}/integrations/github`;
  const cursor = async () =>
    (
      await fixture.db.query<{ sync_cursor: string | null }>(
        "SELECT sync_cursor FROM project_integrations WHERE project_id = $1",
        [projectId],
      )
    ).rows[0]!.sync_cursor;

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
      title: "GitHub sync T07",
      compiler: "pdflatex",
    });
    projectId = project.id;
    const connection = await fixture.db.query<{ id: string }>(
      `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, 'github', $2, '["repo"]'::jsonb, 'active') RETURNING id`,
      [owner.id, encryptToken(CONFIG.encryptionKey, "gho_test")],
    );
    connectionId = connection.rows[0]!.id;
    await fixture.db.query(
      `INSERT INTO project_integrations (project_id, connection_id, provider, remote_ref, branch, sync_cursor)
       VALUES ($1, $2, 'github', 'octo/docs', 'main', $3)`,
      [projectId, connectionId, SHA],
    );
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      storage: {} as never,
      githubAuth: { config: CONFIG },
      githubSyncReader: reader,
      githubPushWriter: writer,
      githubSyncInvalidations: { publish: async () => {} },
    });
  });
  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  it("requires the session CSRF guard before an expired-token status is rejected", async () => {
    await fixture.db.query("UPDATE external_connections SET status = 'revoked' WHERE id = $1", [
      connectionId,
    ]);
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: `${base()}/status`,
            headers: { origin, cookie },
          })
        ).statusCode,
      ).toBe(403);
      const denied = await app.inject({
        method: "POST",
        url: `${base()}/status`,
        headers: headers(),
      });
      expect(denied.statusCode).toBe(401);
      expect(denied.json()).toMatchObject({ code: "CREDENTIALS_MISSING" });
      expect(await cursor()).toBe(SHA);
    } finally {
      await fixture.db.query("UPDATE external_connections SET status = 'active' WHERE id = $1", [
        connectionId,
      ]);
    }
  });

  it("surfaces a remote advance at status time as 409 without a fake synced cursor", async () => {
    tree = { sha: "9".repeat(40), defaultBranch: "main", entries: [] };
    try {
      const response = await app.inject({
        method: "POST",
        url: `${base()}/status`,
        headers: headers(),
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "REMOTE_CONFLICT" });
      expect(await cursor()).toBe(SHA);
    } finally {
      tree = { sha: SHA, defaultBranch: "main", entries: [] };
    }
  });

  it("rejects a sync whose expected SHA no longer matches the linked cursor", async () => {
    const response = await app.inject({
      method: "POST",
      url: `${base()}/sync`,
      headers: { ...headers(), "idempotency-key": "s12-t07-stale-cursor-1234" },
      payload: {
        direction: "pull",
        sourceRevisionId: "11111111-1111-4111-8111-111111111111",
        expectedRemoteRevision: "f".repeat(40),
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "REMOTE_CONFLICT" });
    expect(await cursor()).toBe(SHA);
  });

  it("applies a remote add through the authorized pull route", async () => {
    tree = {
      sha: SHA,
      defaultBranch: "main",
      entries: [{ path: "intro.tex", kind: "file", sizeBytes: 5, sha: "e".repeat(40) }],
    };
    files.set("intro.tex", Buffer.from("\\section{}\n"));
    const status = await app.inject({
      method: "POST",
      url: `${base()}/status`,
      headers: headers(),
    });
    expect(status.statusCode).toBe(200);
    const plan = status.json() as { status: string; sourceRevisionId: string; entries: unknown[] };
    expect(plan.status).toBe("sync_pending");
    expect(plan.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "intro.tex", action: "add" })]),
    );

    const response = await app.inject({
      method: "POST",
      url: `${base()}/sync`,
      headers: { ...headers(), "idempotency-key": "s12-t07-pull-add-1234" },
      payload: {
        direction: "pull",
        sourceRevisionId: plan.sourceRevisionId,
        expectedRemoteRevision: SHA,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "succeeded" });
    const node = await fixture.db.query<{ content_kind: string }>(
      "SELECT content_kind FROM project_nodes WHERE project_id = $1 AND name = 'intro.tex'",
      [projectId],
    );
    expect(node.rows[0]?.content_kind).toBe("TEXT");
  });

  it("pushes the frozen revision through the route only after remote success", async () => {
    tree = { sha: SHA, defaultBranch: "main", entries: [] };
    files.clear();
    const status = await app.inject({
      method: "POST",
      url: `${base()}/status`,
      headers: headers(),
    });
    expect(status.statusCode).toBe(200);
    const plan = status.json() as { sourceRevisionId: string };

    const response = await app.inject({
      method: "POST",
      url: `${base()}/sync`,
      headers: { ...headers(), "idempotency-key": "s12-t07-push-1234" },
      payload: {
        direction: "push",
        sourceRevisionId: plan.sourceRevisionId,
        expectedRemoteRevision: SHA,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "succeeded" });
    expect(await cursor()).toBe(COMMIT);
    const audit = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM audit_events WHERE project_id = $1 AND action = 'github.push'",
      [projectId],
    );
    expect(audit.rows[0]!.count).toBe("1");
  });

  it("surfaces a non-fast-forward ref race as 409 and keeps the cursor", async () => {
    const before = await cursor();
    tree = { sha: before!, defaultBranch: "main", entries: [] };
    const status = await app.inject({
      method: "POST",
      url: `${base()}/status`,
      headers: headers(),
    });
    const plan = status.json() as { sourceRevisionId: string };

    updateError = "REMOTE_CONFLICT";
    try {
      const response = await app.inject({
        method: "POST",
        url: `${base()}/sync`,
        headers: { ...headers(), "idempotency-key": "s12-t07-race-1234" },
        payload: {
          direction: "push",
          sourceRevisionId: plan.sourceRevisionId,
          expectedRemoteRevision: before,
        },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "REMOTE_CONFLICT" });
    } finally {
      updateError = null;
    }
    expect(await cursor()).toBe(before);
  });
});
