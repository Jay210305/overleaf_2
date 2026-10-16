import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S08-T03 project member management", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    member = await fixture.seed();
    projectId = randomUUID();
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Sharing UI test')",
      [projectId, owner.id],
    );
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')",
      [projectId, member.id],
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

  it("shows members to the owner and applies owner role changes and removal", async () => {
    const ownerHeaders = await headers(owner.email);
    const listed = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/members`,
      headers: ownerHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: owner.id, role: "OWNER" }),
        expect.objectContaining({ userId: member.id, role: "EDITOR" }),
      ]),
    );
    const firstPage = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/members?limit=1`,
      headers: ownerHeaders,
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json().items).toHaveLength(1);
    const secondPage = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/members?limit=1&cursor=${firstPage.json().nextCursor}`,
      headers: ownerHeaders,
    });
    expect(secondPage.statusCode).toBe(200);
    expect(secondPage.json().items).toHaveLength(1);
    expect(secondPage.json().items[0].userId).not.toBe(firstPage.json().items[0].userId);
    const changed = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/members/${member.id}`,
      headers: ownerHeaders,
      payload: { role: "VIEWER" },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ userId: member.id, role: "VIEWER" });
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/members/${member.id}`,
      headers: ownerHeaders,
    });
    expect(removed.statusCode).toBe(204);
    const denied = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: await headers(member.email),
    });
    expect(denied.statusCode).toBe(404);
  });

  it("denies handcrafted non-owner, owner-target, and foreign-project mutations", async () => {
    await fixture.db.query(
      "UPDATE project_members SET revoked_at = NULL WHERE project_id = $1 AND user_id = $2",
      [projectId, member.id],
    );
    const memberHeaders = await headers(member.email);
    const ownerHeaders = await headers(owner.email);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}/members`,
          headers: memberHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/projects/${projectId}/members/${owner.id}`,
          headers: memberHeaders,
          payload: { role: "EDITOR" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/members/${owner.id}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/projects/${projectId}/members/${member.id}`,
          headers: ownerHeaders,
          payload: { role: "OWNER" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/members/${member.id}`,
          headers: { ...ownerHeaders, "x-csrf-token": "forged" },
        })
      ).statusCode,
    ).toBe(403);
    const foreignProject = randomUUID();
    await fixture.db.query(
      "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Foreign')",
      [foreignProject, owner.id],
    );
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/projects/${foreignProject}/members/${member.id}`,
          headers: ownerHeaders,
          payload: { role: "VIEWER" },
        })
      ).statusCode,
    ).toBe(404);
  });

  it("makes an explicit owner role change independent of a share link", async () => {
    const linked = await fixture.seed();
    const linkId = randomUUID();
    await fixture.db.query(
      `INSERT INTO share_links (id, project_id, token_hash, role, expires_at)
       VALUES ($1, $2, $3, 'VIEWER', NOW() + interval '1 hour')`,
      [linkId, projectId, randomBytes(32).toString("hex")],
    );
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, source_share_link_id)
       VALUES ($1, $2, 'VIEWER', $3)`,
      [projectId, linked.id, linkId],
    );
    const changed = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/members/${linked.id}`,
      headers: await headers(owner.email),
      payload: { role: "EDITOR" },
    });
    expect(changed.statusCode).toBe(200);
    const source = await fixture.db.query<{ source_share_link_id: string | null }>(
      "SELECT source_share_link_id FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, linked.id],
    );
    expect(source.rows[0]?.source_share_link_id).toBeNull();
    await fixture.db.query("UPDATE share_links SET revoked_at = NOW() WHERE id = $1", [linkId]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}`,
          headers: await headers(linked.email),
        })
      ).statusCode,
    ).toBe(200);
  });
});
