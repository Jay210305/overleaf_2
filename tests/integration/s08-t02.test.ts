import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createRedisAuthRateLimiter } from "../../apps/api/src/plugins/rate-limit.js";
import { parseServerConfig } from "@latex-collab/config/server";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T02 bounded share links", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let owner: { id: string; email: string };
  let recipient: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    recipient = await fixture.seed();
    projectId = randomUUID();
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Share test')",
      [projectId, owner.id],
    );
    app = createServer({ checkReadiness: async () => true, db: fixture.db, origin, logger: false });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  async function headers(email: string) {
    const login = await fixture.login(email);
    expect(login.statusCode).toBe(200);
    return {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(login.headers["x-csrf-token"]),
    };
  }

  it("accepts both share-link write scopes in the live Redis limiter", async () => {
    const limiter = await createRedisAuthRateLimiter(parseServerConfig(process.env).REDIS_URL, {
      namespace: `s08-t02-${randomUUID()}`,
    });
    try {
      expect(
        (await limiter.consume("127.0.0.1", "POST /api/v1/projects/:projectId/share-links"))
          .allowed,
      ).toBe(true);
      expect((await limiter.consume("127.0.0.1", "POST /api/v1/share-links/redeem")).allowed).toBe(
        true,
      );
    } finally {
      await limiter.close();
    }
  });

  it("applies the shared limiter to link creation and redemption", async () => {
    const scopes: string[] = [];
    const limitedApp = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
      rateLimiter: {
        consume: async (_key, scope) => {
          scopes.push(scope);
          return { allowed: false, retryAfterSeconds: 1 };
        },
      },
    });
    try {
      const created = await limitedApp.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/share-links`,
        headers: { origin },
        payload: { role: "VIEWER", expiresAt: new Date(Date.now() + 60_000).toISOString() },
      });
      const redeemed = await limitedApp.inject({
        method: "POST",
        url: "/api/v1/share-links/redeem",
        headers: { origin },
        payload: { token: "x".repeat(43) },
      });
      expect([created.statusCode, redeemed.statusCode]).toEqual([429, 429]);
      expect(scopes).toEqual([
        "POST /api/v1/projects/:projectId/share-links",
        "POST /api/v1/share-links/redeem",
      ]);
    } finally {
      await limitedApp.close();
    }
  });

  it("reveals a high-entropy token only at creation and binds a redeemed role to a trusted account", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: {
        role: "VIEWER",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        maxUses: 1,
      },
    });
    expect(created.statusCode).toBe(201);
    const { link, token } = created.json();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link).toMatchObject({ projectId, role: "VIEWER", maxUses: 1, useCount: 0 });
    const stored = await fixture.db.query<{ token_hash: string }>(
      "SELECT token_hash FROM share_links WHERE id = $1",
      [link.id],
    );
    expect(stored.rows[0]?.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain(token);
    expect(listed.body).not.toContain(stored.rows[0]!.token_hash);

    const recipientHeaders = await headers(recipient.email);
    const redeemed = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: recipientHeaders,
      payload: { token },
    });
    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json()).toEqual({ projectId, role: "VIEWER" });
    const project = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: recipientHeaders,
    });
    expect(project.statusCode).toBe(200);
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: await headers((await fixture.seed()).email),
      payload: { token },
    });
    expect(second.statusCode).toBe(410);
    const count = await fixture.db.query<{ use_count: string }>(
      "SELECT use_count::text FROM share_links WHERE id = $1",
      [link.id],
    );
    expect(count.rows[0]?.use_count).toBe("1");
  });

  it("removes link-derived access on revocation and rejects a forged owner role", async () => {
    const ownerHeaders = await headers(owner.email);
    const bad = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "OWNER", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(bad.statusCode).toBe(400);
    const tooLong = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: {
        role: "VIEWER",
        expiresAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(tooLong.statusCode).toBe(400);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "EDITOR", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(created.statusCode).toBe(201);
    const { link, token } = created.json();
    const revokedAccount = await fixture.seed();
    const recipientHeaders = await headers(revokedAccount.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: recipientHeaders,
          payload: { token },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}`,
          headers: recipientHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/share-links/${link.id}`,
          headers: recipientHeaders,
        })
      ).statusCode,
    ).toBe(403);
    const otherProjectId = randomUUID();
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Other project')",
      [otherProjectId, owner.id],
    );
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${otherProjectId}/share-links/${link.id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/share-links/${link.id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}`,
          headers: recipientHeaders,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: await headers((await fixture.seed()).email),
          payload: { token },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("stops access when a link expires after redemption", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: await headers(owner.email),
      payload: { role: "VIEWER", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(created.statusCode).toBe(201);
    const { link, token } = created.json();
    const account = await fixture.seed();
    const accountHeaders = await headers(account.email);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: accountHeaders,
          payload: { token },
        })
      ).statusCode,
    ).toBe(200);
    await fixture.db.query(
      "UPDATE share_links SET created_at = NOW() - interval '2 minutes', expires_at = NOW() - interval '1 second' WHERE id = $1",
      [link.id],
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}`,
          headers: accountHeaders,
        })
      ).statusCode,
    ).toBe(404);
  });

  it("keeps a later owner invitation independent of a revoked link", async () => {
    const account = await fixture.seed();
    const accountHeaders = await headers(account.email);
    const ownerHeaders = await headers(owner.email);
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "VIEWER", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(created.statusCode).toBe(201);
    const { link, token } = created.json();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: accountHeaders,
          payload: { token },
        })
      ).statusCode,
    ).toBe(200);
    await fixture.db.query(
      "UPDATE share_links SET created_at = NOW() - interval '2 minutes', expires_at = NOW() - interval '1 second' WHERE id = $1",
      [link.id],
    );
    const inviteToken = randomBytes(32).toString("base64url");
    await fixture.db.query(
      `INSERT INTO project_invitations (project_id, email_normalized, role, token_hash, expires_at, delivered_at, invited_by)
       VALUES ($1, $2, 'EDITOR', $3, NOW() + interval '1 hour', NOW(), $4)`,
      [projectId, account.email, createHash("sha256").update(inviteToken).digest("hex"), owner.id],
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: accountHeaders,
          payload: { token: inviteToken },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/share-links/${link.id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}`,
          headers: accountHeaders,
        })
      ).statusCode,
    ).toBe(200);
  });
});
