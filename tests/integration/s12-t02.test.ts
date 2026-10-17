import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { AuthError } from "../../apps/api/src/modules/auth/errors.js";
import { type GitHubOAuthConfig } from "../../apps/api/src/modules/integrations/github-auth.js";
import {
  type RemoteReader,
  type RemoteTree,
} from "../../apps/api/src/modules/integrations/github-link.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

loadEnvFile(".env");

const TEST_TOKEN = "gho_s12_t02_token";
const TEST_CONFIG: GitHubOAuthConfig = {
  clientId: "test-github-client-id",
  authorizationEndpoint: "https://github.test/login/oauth/authorize",
  tokenEndpoint: "https://github.test/login/oauth/access_token",
  callbackUrl: "http://127.0.0.1:5173/settings/integrations",
  scopes: ["repo"],
  encryptionKey: "test-encryption-key-min-16-chars!!",
};
const SHA_MAIN = "a".repeat(40);
const SHA_TRUNK = "b".repeat(40);

const treeFor = (remoteRef: string, branch: string): RemoteTree => {
  if (remoteRef === "octo/docs" && branch === "main")
    return {
      sha: SHA_MAIN,
      defaultBranch: "main",
      entries: [
        { path: "main.tex", kind: "file", sizeBytes: 120 },
        { path: "chapters/intro.tex", kind: "file", sizeBytes: 40 },
        { path: "assets", kind: "folder", sizeBytes: 0 },
      ],
    };
  if (remoteRef === "octo/docs" && branch === "clash") {
    return {
      sha: SHA_TRUNK,
      defaultBranch: "main",
      entries: [{ path: "main.tex", kind: "folder", sizeBytes: 0 }],
    };
  }
  throw new AuthError(404, "RESOURCE_NOT_FOUND");
};

describe("S12-T02 link authorized repository and branch", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let csrf: string;
  let ownerId: string;
  let connectionId: string;
  let readerMode: "ok" | "expired" | "down" = "ok";

  const reader: RemoteReader = {
    listRepos: async () => [
      { fullName: "octo/docs", defaultBranch: "main", private: false },
      { fullName: "octo/notes", defaultBranch: "trunk", private: true },
    ],
    readTree: async (_token, remoteRef, branch) => {
      if (readerMode === "expired") throw new AuthError(401, "TOKEN_EXPIRED");
      if (readerMode === "down") throw new Error("provider down");
      return treeFor(remoteRef, branch);
    },
  };

  const authHeaders = (overrides: Record<string, string> = {}) => ({
    origin,
    cookie,
    "x-csrf-token": csrf,
    ...overrides,
  });

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    ownerId = owner.id;
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    csrf = String(login.headers["x-csrf-token"]);
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      githubAuth: {
        config: TEST_CONFIG,
        exchangeCode: async () => ({ accessToken: TEST_TOKEN, scope: "repo" }),
        reader,
      },
    });
    const state = (
      await app.inject({
        method: "POST",
        url: "/api/v1/integrations/github/start",
        headers: authHeaders(),
      })
    ).json() as { state: string };
    const connected = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/callback",
      headers: authHeaders(),
      payload: { code: "valid-code", state: state.state },
    });
    connectionId = (connected.json() as { connectionId: string }).connectionId;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  const repos = (headers: Record<string, string> = {}) =>
    app.inject({
      method: "GET",
      url: `/api/v1/integrations/github/repos?connectionId=${connectionId}`,
      headers: authHeaders(headers),
    });
  const link = (payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
    app.inject({
      method: "POST",
      url: "/api/v1/integrations/github/link",
      headers: authHeaders(headers),
      payload,
    });

  it("lists authorized repositories without leaking the token", async () => {
    const response = await repos();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      repos: [
        { fullName: "octo/docs", defaultBranch: "main", private: false },
        { fullName: "octo/notes", defaultBranch: "trunk", private: true },
      ],
    });
    expect(response.body).not.toContain(TEST_TOKEN);
    const foreign = await app.inject({
      method: "GET",
      url: "/api/v1/integrations/github/repos?connectionId=00000000-0000-4000-8000-000000000000",
      headers: authHeaders(),
    });
    expect(foreign.statusCode).toBe(404);
    expect((await repos({ cookie: "session=invalid" })).statusCode).toBe(401);
  });

  it("imports-new without merging remote content", async () => {
    const response = await link({
      connectionId,
      mode: "import-new",
      title: "Docs import",
      remoteRef: "octo/docs",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      projectId: string;
      branch: string;
      remoteSha: string;
      comparison: Array<{ path: string; side: string }>;
      conflict: boolean;
    };
    expect(body.branch).toBe("main");
    expect(body.remoteSha).toBe(SHA_MAIN);
    expect(body.conflict).toBe(false);
    expect(body.comparison.map((entry) => `${entry.side}:${entry.path}`)).toEqual([
      "only-remote:assets",
      "only-remote:chapters/intro.tex",
    ]);
    expect(JSON.stringify(body)).not.toContain(TEST_TOKEN);
    const nodes = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL",
      [body.projectId],
    );
    expect(nodes.rows[0]!.count).toBe("1");
    const rows = await fixture.db.query<{
      remote_ref: string;
      branch: string;
      sync_cursor: string;
    }>("SELECT remote_ref, branch, sync_cursor FROM project_integrations WHERE project_id = $1", [
      body.projectId,
    ]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      remote_ref: "octo/docs",
      branch: "main",
      sync_cursor: SHA_MAIN,
    });
  });

  it("pairs-existing idempotently and denies foreign projects", async () => {
    const created = await createProject(fixture.db, ownerId, {
      title: "Pair target",
      compiler: "pdflatex",
    });
    const first = await link({
      connectionId,
      mode: "pair-existing",
      projectId: created.id,
      remoteRef: "octo/docs",
    });
    expect(first.statusCode).toBe(200);
    const again = await link({
      connectionId,
      mode: "pair-existing",
      projectId: created.id,
      remoteRef: "octo/docs",
    });
    expect(again.statusCode).toBe(200);
    const rows = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM project_integrations WHERE project_id = $1",
      [created.id],
    );
    expect(rows.rows[0]!.count).toBe("1");
    const stranger = await fixture.seed();
    const strangerProject = await createProject(fixture.db, stranger.id, {
      title: "Not yours",
      compiler: "pdflatex",
    });
    expect(
      (
        await link({
          connectionId,
          mode: "pair-existing",
          projectId: strangerProject.id,
          remoteRef: "octo/docs",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("denies viewers and reports differing manifests as conflict", async () => {
    const owner = await fixture.seed();
    const project = await createProject(fixture.db, owner.id, {
      title: "Guarded",
      compiler: "pdflatex",
    });
    const viewer = await fixture.seed();
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [project.id, viewer.id],
    );
    const viewerLogin = await fixture.login(viewer.email);
    const viewerHeaders = {
      origin,
      cookie: String(viewerLogin.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(viewerLogin.headers["x-csrf-token"]),
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/integrations/github/link",
          headers: viewerHeaders,
          payload: {
            connectionId,
            mode: "pair-existing",
            projectId: project.id,
            remoteRef: "octo/docs",
          },
        })
      ).statusCode,
    ).toBe(404);
    const clash = await link({
      connectionId,
      mode: "import-new",
      title: "Clash import",
      remoteRef: "octo/docs",
      branch: "clash",
    });
    expect(clash.statusCode).toBe(200);
    const body = clash.json() as {
      conflict: boolean;
      comparison: Array<{ path: string; side: string }>;
    };
    expect(body.conflict).toBe(true);
    expect(body.comparison).toContainEqual(
      expect.objectContaining({ path: "main.tex", side: "differing" }),
    );
  });

  it("rejects stale SHAs and provider failures without recording links", async () => {
    const stale = await link({
      connectionId,
      mode: "import-new",
      title: "Stale",
      remoteRef: "octo/docs",
      expectedRemoteSha: "c".repeat(40),
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "REMOTE_CONFLICT" });
    for (const title of ["Stale", "Expired", "Down"]) {
      const orphans = await fixture.db.query<{ id: string }>(
        "SELECT id FROM projects WHERE title = $1",
        [title],
      );
      expect(orphans.rows).toHaveLength(0);
    }
    readerMode = "expired";
    const expired = await link({
      connectionId,
      mode: "import-new",
      title: "Expired",
      remoteRef: "octo/docs",
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toMatchObject({ code: "TOKEN_EXPIRED" });
    readerMode = "down";
    const down = await link({
      connectionId,
      mode: "import-new",
      title: "Down",
      remoteRef: "octo/docs",
    });
    expect(down.statusCode).toBe(502);
    readerMode = "ok";
    const count = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM project_integrations WHERE remote_ref = 'octo/docs'",
    );
    expect(Number(count.rows[0]!.count)).toBeGreaterThanOrEqual(3);
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
        url: "/api/v1/integrations/github/link",
        headers: authHeaders(),
        payload: { connectionId, mode: "import-new", title: "Nope", remoteRef: "octo/docs" },
      });
      expect(denied.statusCode).toBe(503);
      expect(denied.json()).toMatchObject({ code: "CREDENTIALS_MISSING" });
    } finally {
      await bare.close();
    }
  });
});
