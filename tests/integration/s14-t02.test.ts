import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGitBridgeServer } from "../../apps/git-bridge/src/server.js";
import { InMemoryGitTokenStore } from "../../apps/git-bridge/src/auth.js";
import { createSessionFixture } from "../helpers/s02-session.js";

describe("S14-T02: Authenticated Git bridge service", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let tokenStore: InMemoryGitTokenStore;
  let server: ReturnType<typeof createGitBridgeServer>;
  let ownerUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };
  let strangerUser: { id: string; email: string };
  let project: { id: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    ownerUser = await fixture.seed();
    viewerUser = await fixture.seed();
    strangerUser = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('Git Bridge Test Project', $1, 'pdflatex', 'active')
       RETURNING id`,
      [ownerUser.id],
    );
    project = { id: projRes.rows[0]!.id };

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'VIEWER')`,
      [project.id, viewerUser.id],
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

  describe("Token Generation, Hashing, and Revocation", () => {
    it("creates revocable scoped tokens storing only hashes", async () => {
      const { token, rawToken } = await tokenStore.createToken({
        userId: ownerUser.id,
        name: "My CLI Token",
        scopes: ["git:read", "git:write"],
      });

      expect(rawToken.startsWith("glc_git_")).toBe(true);
      expect(token.tokenHash).not.toBe(rawToken);
      expect(token.tokenHash.length).toBe(64); // SHA-256
      expect(token.scopes).toEqual(["git:read", "git:write"]);

      const found = await tokenStore.findActiveToken(rawToken);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(token.id);
    });

    it("revokes token immediately and refuses subsequent authentication", async () => {
      const { token, rawToken } = await tokenStore.createToken({
        userId: ownerUser.id,
        name: "Revocable Token",
        scopes: ["git:read"],
      });

      const activeBefore = await tokenStore.findActiveToken(rawToken);
      expect(activeBefore).not.toBeNull();

      const revoked = await tokenStore.revokeToken(token.id, ownerUser.id);
      expect(revoked).toBe(true);

      const activeAfter = await tokenStore.findActiveToken(rawToken);
      expect(activeAfter).toBeNull();
    });

    it("expires token when expiresAt is in the past", async () => {
      const pastDate = new Date(Date.now() - 60000);
      const { rawToken } = await tokenStore.createToken({
        userId: ownerUser.id,
        name: "Expired Token",
        scopes: ["git:read"],
        expiresAt: pastDate,
      });

      const found = await tokenStore.findActiveToken(rawToken);
      expect(found).toBeNull();
    });
  });

  describe("Smart HTTP Protocol Authentication & Authorization", () => {
    it("returns 401 with WWW-Authenticate header when unauthenticated", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers["www-authenticate"]).toContain('Basic realm="LaTeX Collaborative Git Bridge"');
      expect(res.payload).toContain("Git HTTP authentication required");
    });

    it("allows git-upload-pack (clone/fetch) for owner with git:read token", async () => {
      const { rawToken } = await tokenStore.createToken({
        userId: ownerUser.id,
        name: "Read Token",
        scopes: ["git:read"],
      });

      const res = await server.inject({
        method: "GET",
        url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
        headers: {
          authorization: makeBasicAuth(ownerUser.email, rawToken),
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/x-git-upload-pack-advertisement");
      expect(res.payload).toContain("# service=git-upload-pack");
      expect(res.payload).toContain("refs/heads/main");
    });

    it("denies git-receive-pack (push) when token only has git:read scope", async () => {
      const { rawToken } = await tokenStore.createToken({
        userId: ownerUser.id,
        name: "Read Only Token",
        scopes: ["git:read"], // Missing git:write
      });

      const res = await server.inject({
        method: "GET",
        url: `/git/${project.id}.git/info/refs?service=git-receive-pack`,
        headers: {
          authorization: makeBasicAuth(ownerUser.email, rawToken),
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.payload).toContain("INSUFFICIENT_SCOPE");
    });

    it("allows git-receive-pack (push) for owner with git:write token", async () => {
      const { rawToken } = await tokenStore.createToken({
        userId: ownerUser.id,
        name: "Write Token",
        scopes: ["git:read", "git:write"],
      });

      const res = await server.inject({
        method: "GET",
        url: `/git/${project.id}.git/info/refs?service=git-receive-pack`,
        headers: {
          authorization: makeBasicAuth(ownerUser.email, rawToken),
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/x-git-receive-pack-advertisement");
      expect(res.payload).toContain("# service=git-receive-pack");
    });

    it("enforces project permissions: VIEWER cannot push even with git:write token (403)", async () => {
      const { rawToken } = await tokenStore.createToken({
        userId: viewerUser.id,
        name: "Viewer Write Token",
        scopes: ["git:read", "git:write"],
      });

      const res = await server.inject({
        method: "GET",
        url: `/git/${project.id}.git/info/refs?service=git-receive-pack`,
        headers: {
          authorization: makeBasicAuth(viewerUser.email, rawToken),
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.payload).toContain("Write access denied");
    });

    it("denies access to stranger with 404 RESOURCE_NOT_FOUND", async () => {
      const { rawToken } = await tokenStore.createToken({
        userId: strangerUser.id,
        name: "Stranger Token",
        scopes: ["git:read"],
      });

      const res = await server.inject({
        method: "GET",
        url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
        headers: {
          authorization: makeBasicAuth(strangerUser.email, rawToken),
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.payload).toContain("Repository not found");
    });
  });

  describe("Security and Secret Redaction", () => {
    it("never includes database secrets or session credentials in responses", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/git/${project.id}.git/info/refs?service=git-upload-pack`,
        headers: {
          authorization: "Basic aW52YWxpZHVzZXI6aW52YWxpZHBhc3N3b3Jk",
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.payload).not.toContain("password");
      expect(res.payload).not.toContain("secret");
      expect(res.payload).not.toContain("postgres");
    });
  });
});
