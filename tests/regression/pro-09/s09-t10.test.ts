import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression PRO-09 (S09-T10): Many-to-many project tag links and isolation", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let p1: string;
  let p2: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();

    const r1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`PRO-09 P1 ${randomUUID()}`, user.id],
    );
    p1 = r1.rows[0]!.id;

    const r2 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`PRO-09 P2 ${randomUUID()}`, user.id],
    );
    p2 = r2.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("links single tag to multiple projects and filters both projects accurately", async () => {
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    // Create tag
    const tRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { name: "Multi-Project-Tag", color: "#9c27b0" },
    });
    const tagId = tRes.json().id;

    // Link tag to both projects
    await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${p1}/tags/${tagId}`,
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${p2}/tags/${tagId}`,
      headers: { origin, cookie, "x-csrf-token": csrf },
    });

    // Query projects with tagId filter
    const listRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?tagId=${tagId}`,
      headers: { origin, cookie },
    });

    expect(listRes.statusCode).toBe(200);
    const { items } = listRes.json();
    const ids = items.map((p: { id: string }) => p.id);
    expect(ids).toContain(p1);
    expect(ids).toContain(p2);
  });
});
