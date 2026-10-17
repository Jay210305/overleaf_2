import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGitBridgeServer } from "../../../apps/git-bridge/src/server.js";
import { InMemoryGitTokenStore } from "../../../apps/git-bridge/src/auth.js";
import { createSessionFixture } from "../../helpers/s02-session.js";

describe("Regression INT-06 (S14-T02): Git HTTP bridge authentication and scoped access control", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let tokenStore: InMemoryGitTokenStore;
  let server: ReturnType<typeof createGitBridgeServer>;
  let ownerUser: { id: string; email: string };
  let editorUser: { id: string; email: string };
  let nonMemberUser: { id: string; email: string };
  let project: { id: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    ownerUser = await fixture.seed();
    editorUser = await fixture.seed();
    nonMemberUser = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('Regression INT-06 Repo', $1, 'pdflatex', 'active')
       RETURNING id`,
      [ownerUser.id],
    );
    project = { id: projRes.rows[0]!.id };

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'EDITOR')`,
      [project.id, editorUser.id],
    );

    tokenStore = new InMemoryGitTokenStore();
    server = createGitBridgeServer({
      db: fixture.db,
      tokenStore,
    });
  });

  afterAll(async () => {
    await server.close();
    await fixture.close();
  });

  function makeBasicAuth(username: string, token: string): string {
    return `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;
  }

  it("denies unauthenticated requests with 401 and WWW-Authenticate header", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toBe('Basic realm="LaTeX Collaborative Git Bridge"');
  });

  it("denies non-members with 404 to avoid leaking repository existence", async () => {
    const { rawToken } = await tokenStore.createToken({
      userId: nonMemberUser.id,
      name: "Non-member token",
      scopes: ["git:read", "git:write"],
    });

    const res = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(nonMemberUser.email, rawToken),
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.payload).toContain("RESOURCE_NOT_FOUND");
  });

  it("allows EDITOR role to access upload-pack with git:read scope", async () => {
    const { rawToken } = await tokenStore.createToken({
      userId: editorUser.id,
      name: "Editor read token",
      scopes: ["git:read"],
    });

    const res = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(editorUser.email, rawToken),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("# service=git-upload-pack");
  });

  it("allows EDITOR role to access receive-pack with git:write scope", async () => {
    const { rawToken } = await tokenStore.createToken({
      userId: editorUser.id,
      name: "Editor write token",
      scopes: ["git:read", "git:write"],
    });

    const res = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-receive-pack`,
      headers: {
        authorization: makeBasicAuth(editorUser.email, rawToken),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("# service=git-receive-pack");
  });

  it("immediately denies access when token is revoked", async () => {
    const { token, rawToken } = await tokenStore.createToken({
      userId: editorUser.id,
      name: "Revocable token",
      scopes: ["git:read"],
    });

    // Valid initially
    const res1 = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(editorUser.email, rawToken),
      },
    });
    expect(res1.statusCode).toBe(200);

    // Revoke
    await tokenStore.revokeToken(token.id, editorUser.id);

    // Denied after revocation
    const res2 = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(editorUser.email, rawToken),
      },
    });
    expect(res2.statusCode).toBe(401);
    expect(res2.payload).toContain("TOKEN_EXPIRED");
  });
});
