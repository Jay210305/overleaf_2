import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S09-T10: Owned project tags and filtering", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let projectA1: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    userA = await fixture.seed();
    userB = await fixture.seed();

    const p1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Project Alpha ${randomUUID()}`, userA.id],
    );
    projectA1 = p1.rows[0]!.id;

    await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Project Beta ${randomUUID()}`, userA.id],
    );
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

  it("creates, lists, updates, and deletes user-owned tags with duplicate protection", async () => {
    const sessionA = await getSession(userA.email);

    // 1. Create tag
    const resCreate = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
      payload: { name: "Thesis", color: "#ff5722" },
    });
    expect(resCreate.statusCode).toBe(201);
    const tag = resCreate.json();
    expect(tag.name).toBe("Thesis");
    expect(tag.color).toBe("#ff5722");

    // 2. Duplicate tag name fails with 409
    const resDup = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
      payload: { name: "Thesis", color: "#000000" },
    });
    expect(resDup.statusCode).toBe(409);

    // 3. List tags
    const resList = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/tags",
      headers: { origin, cookie: sessionA.cookie },
    });
    expect(resList.statusCode).toBe(200);
    const listBody = resList.json();
    expect(listBody.items.some((t: { id: string }) => t.id === tag.id)).toBe(true);

    // 4. Update tag
    const resPatch = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/tags/${tag.id}`,
      headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
      payload: { name: "PhD Thesis", color: "#e91e63" },
    });
    expect(resPatch.statusCode).toBe(200);
    expect(resPatch.json().name).toBe("PhD Thesis");

    // 5. Delete tag
    const resDel = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/tags/${tag.id}`,
      headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
    });
    expect(resDel.statusCode).toBe(204);
  });

  it("links tags to projects and filters project pagination by tagId", async () => {
    const sessionA = await getSession(userA.email);

    // Create a tag
    const tRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
      payload: { name: "Research 2026", color: "#4caf50" },
    });
    const tagId = tRes.json().id;

    // Link tag to projectA1 only
    const linkRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectA1}/tags/${tagId}`,
      headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
    });
    expect(linkRes.statusCode).toBe(204);

    // Filter projects by tagId
    const filterRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?tagId=${tagId}`,
      headers: { origin, cookie: sessionA.cookie },
    });
    expect(filterRes.statusCode).toBe(200);
    const { items } = filterRes.json();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(projectA1);

    // Unlink tag
    const unlinkRes = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectA1}/tags/${tagId}`,
      headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
    });
    expect(unlinkRes.statusCode).toBe(204);

    // Filter again returns empty
    const filterEmpty = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?tagId=${tagId}`,
      headers: { origin, cookie: sessionA.cookie },
    });
    expect(filterEmpty.statusCode).toBe(200);
    expect(filterEmpty.json().items).toHaveLength(0);
  });

  it("strictly isolates tags between users: user B cannot see or link user A's tags", async () => {
    const sessionA = await getSession(userA.email);
    const sessionB = await getSession(userB.email);

    // User A creates tag
    const tRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
      payload: { name: "Private User A Tag", color: "#123456" },
    });
    const tagIdA = tRes.json().id;

    // User B listing tags does not include user A's tag
    const bList = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/tags",
      headers: { origin, cookie: sessionB.cookie },
    });
    expect(bList.statusCode).toBe(200);
    expect(bList.json().items.some((t: { id: string }) => t.id === tagIdA)).toBe(false);

    // User B attempting to modify or delete User A's tag gets 404
    const bPatch = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/tags/${tagIdA}`,
      headers: { origin, cookie: sessionB.cookie, "x-csrf-token": sessionB.csrf },
      payload: { name: "Hacked Tag" },
    });
    expect(bPatch.statusCode).toBe(404);

    const bDel = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/tags/${tagIdA}`,
      headers: { origin, cookie: sessionB.cookie, "x-csrf-token": sessionB.csrf },
    });
    expect(bDel.statusCode).toBe(404);
  });
});
