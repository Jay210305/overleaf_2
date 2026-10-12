import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-01 regression: Paginated searchable owned/shared/recent dashboard (S03-T01)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user1: { id: string; email: string };
  let user2: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user1 = await fixture.seed();
    user2 = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("filters correctly across owned, shared, and recent categories", async () => {
    const s1 = await getSession(user1.email);
    const s2 = await getSession(user2.email);

    // user1 creates an owned project
    const p1Res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s1.cookie, "x-csrf-token": s1.csrf },
      payload: { title: `User1 Owned ${randomUUID()}` },
    });
    const p1 = p1Res.json();

    // user2 creates a project and invites user1 as EDITOR
    const p2Res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s2.cookie, "x-csrf-token": s2.csrf },
      payload: { title: `User2 Shared ${randomUUID()}` },
    });
    const p2 = p2Res.json();

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [p2.id, user1.id],
    );

    // user1 requests owned
    const ownedList = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/projects?filter=owned",
      headers: { origin, cookie: s1.cookie },
    });
    expect(ownedList.statusCode).toBe(200);
    const ownedIds = ownedList.json().items.map((i: { id: string }) => i.id);
    expect(ownedIds).toContain(p1.id);
    expect(ownedIds).not.toContain(p2.id);

    // user1 requests shared
    const sharedList = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/projects?filter=shared",
      headers: { origin, cookie: s1.cookie },
    });
    expect(sharedList.statusCode).toBe(200);
    const sharedIds = sharedList.json().items.map((i: { id: string }) => i.id);
    expect(sharedIds).toContain(p2.id);
    expect(sharedIds).not.toContain(p1.id);

    // user1 requests recent
    const recentList = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/projects?filter=recent",
      headers: { origin, cookie: s1.cookie },
    });
    expect(recentList.statusCode).toBe(200);
    const recentIds = recentList.json().items.map((i: { id: string }) => i.id);
    expect(recentIds).toContain(p1.id);
    expect(recentIds).toContain(p2.id);
  });
});
