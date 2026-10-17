import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryGitTokenStore } from "../../apps/git-bridge/src/auth.js";
import { createGitBridgeServer } from "../../apps/git-bridge/src/server.js";
import { createSessionFixture } from "../helpers/s02-session.js";

describe("S14-T08: Git protocol verification and token revocation integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let tokenStore: InMemoryGitTokenStore;
  let server: ReturnType<typeof createGitBridgeServer>;
  let ownerUser: { id: string; email: string };
  let collaboratorUser: { id: string; email: string };
  let project: { id: string };
  let activeToken: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    ownerUser = await fixture.seed();
    collaboratorUser = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('S14-T08 Integration Project', $1, 'pdflatex', 'active')
       RETURNING id`,
      [ownerUser.id],
    );
    project = { id: projRes.rows[0]!.id };

    tokenStore = new InMemoryGitTokenStore();
    const tokenResult = await tokenStore.createToken({
      userId: ownerUser.id,
      name: "S14-T08 Integration Token",
      scopes: ["git:read", "git:write"],
    });
    activeToken = tokenResult.rawToken;

    server = createGitBridgeServer({
      db: fixture.db,
      tokenStore,
    });
  });

  afterAll(async () => {
    await server.close();
    await fixture.close();
  });

  function makeBasicAuth(userEmail: string, token: string): string {
    return `Basic ${Buffer.from(`${userEmail}:${token}`).toString("base64")}`;
  }

  it("permits info/refs discovery and clone upload-pack with valid active token", async () => {
    const refsRes = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(ownerUser.email, activeToken),
      },
    });
    expect(refsRes.statusCode).toBe(200);
    expect(refsRes.headers["content-type"]).toBe("application/x-git-upload-pack-advertisement");
    expect(refsRes.body).toContain("refs/heads/main");

    const uploadRes = await server.inject({
      method: "POST",
      url: `/git/${project.id}.git/git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(ownerUser.email, activeToken),
        "content-type": "application/x-git-upload-pack-request",
      },
      payload: Buffer.from("0000"),
    });
    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.headers["content-type"]).toBe("application/x-git-upload-pack-result");
  });

  it("immediately denies Git access when token is revoked", async () => {
    // 1. Create dedicated token and verify it works
    const tempToken = await tokenStore.createToken({
      userId: ownerUser.id,
      name: "To Revoke Token",
      scopes: ["git:read", "git:write"],
    });

    const checkBefore = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(ownerUser.email, tempToken.rawToken),
      },
    });
    expect(checkBefore.statusCode).toBe(200);

    // 2. Revoke token
    const revoked = await tokenStore.revokeToken(tempToken.token.id, ownerUser.id);
    expect(revoked).toBe(true);

    // 3. Request is immediately rejected with 401 TOKEN_EXPIRED
    const checkAfter = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(ownerUser.email, tempToken.rawToken),
      },
    });
    expect(checkAfter.statusCode).toBe(401);
    expect(checkAfter.body).toContain("TOKEN_EXPIRED");
  });

  it("denies Git access when token is expired", async () => {
    const expiredToken = await tokenStore.createToken({
      userId: ownerUser.id,
      name: "Expired Token",
      scopes: ["git:read", "git:write"],
      expiresAt: new Date(Date.now() - 5000),
    });

    const res = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(ownerUser.email, expiredToken.rawToken),
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain("TOKEN_EXPIRED");
  });

  it("enforces project membership and write role permissions for git-receive-pack", async () => {
    // Collaborator without project membership
    const nonMemberToken = await tokenStore.createToken({
      userId: collaboratorUser.id,
      name: "Non-Member Token",
      scopes: ["git:read", "git:write"],
    });

    const nonMemberRes = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(collaboratorUser.email, nonMemberToken.rawToken),
      },
    });
    expect(nonMemberRes.statusCode).toBe(404);
    expect(nonMemberRes.body).toContain("RESOURCE_NOT_FOUND");

    // Add collaborator as VIEWER
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'VIEWER')`,
      [project.id, collaboratorUser.id],
    );

    // VIEWER can read
    const viewerReadRes = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      headers: {
        authorization: makeBasicAuth(collaboratorUser.email, nonMemberToken.rawToken),
      },
    });
    expect(viewerReadRes.statusCode).toBe(200);

    // VIEWER cannot push (write) -> 403 PROJECT_PERMISSION_DENIED
    const viewerWriteRes = await server.inject({
      method: "GET",
      url: `/git/${project.id}.git/info/refs?service=git-receive-pack`,
      headers: {
        authorization: makeBasicAuth(collaboratorUser.email, nonMemberToken.rawToken),
      },
    });
    expect(viewerWriteRes.statusCode).toBe(403);
    expect(viewerWriteRes.body).toContain("PROJECT_PERMISSION_DENIED");
  });
});
