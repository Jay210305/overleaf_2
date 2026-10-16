import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("S08-T08 share-link lifecycle denials (COL-05)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let otherProjectId: string;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    projectId = randomUUID();
    otherProjectId = randomUUID();
    for (const id of [projectId, otherProjectId]) {
      await fixture.db.query("INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Link lifecycle')", [
        id,
        owner.id,
      ]);
    }
  });

  afterAll(async () => {
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

  it("reveals the token once and binds redemption to the source project", async () => {
    const ownerHeaders = await headers(owner.email);
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "EDITOR", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    expect(created.statusCode).toBe(201);
    const token = created.json().token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const listed = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(JSON.stringify(listed.json())).not.toContain(token);
    const redeemer = await fixture.seed();
    const redeemed = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/share-links/redeem",
      headers: await headers(redeemer.email),
      payload: { token },
    });
    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json()).toEqual({ projectId, role: "EDITOR" });
    const home = await fixture.db.query(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [projectId, redeemer.id],
    );
    expect(home.rows).toEqual([{ role: "EDITOR" }]);
    const away = await fixture.db.query(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [otherProjectId, redeemer.id],
    );
    expect(away.rows).toHaveLength(0);
  });

  it("denies unknown tokens and double revocation", async () => {
    const ownerHeaders = await headers(owner.email);
    expect(
      (
        await fixture.app.inject({
          method: "POST",
          url: "/api/v1/share-links/redeem",
          headers: await headers((await fixture.seed()).email),
          payload: { token: "A".repeat(43) },
        })
      ).statusCode,
    ).toBe(404);
    const created = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/share-links`,
      headers: ownerHeaders,
      payload: { role: "VIEWER", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    const linkId = created.json().link.id as string;
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/share-links/${linkId}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await fixture.app.inject({
          method: "DELETE",
          url: `/api/v1/projects/${projectId}/share-links/${linkId}`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(404);
  });
});
