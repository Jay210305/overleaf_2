import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression PRO-09 (S09-T11): Bulk tag linking many-to-many relations", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let p1: string;
  let p2: string;
  let p3: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();

    const r1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Bulk Tag P1 ${randomUUID()}`, user.id],
    );
    p1 = r1.rows[0]!.id;

    const r2 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Bulk Tag P2 ${randomUUID()}`, user.id],
    );
    p2 = r2.rows[0]!.id;

    const r3 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Bulk Tag P3 ${randomUUID()}`, user.id],
    );
    p3 = r3.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("bulk tags three projects simultaneously and confirms many-to-many link filter", async () => {
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    // Create tag
    const tRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { name: "Tri-Bulk-Tag", color: "#673ab7" },
    });
    const tagId = tRes.json().id;

    // Bulk tag p1, p2, p3
    const bulkRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects/bulk",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        projectIds: [p1, p2, p3],
        action: "tag",
        tagId,
      },
    });

    expect(bulkRes.statusCode).toBe(200);
    const { results } = bulkRes.json();
    expect(results).toHaveLength(3);
    expect(results.every((r: { ok: boolean }) => r.ok)).toBe(true);

    // Filter projects by this tagId
    const listRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?tagId=${tagId}`,
      headers: { origin, cookie },
    });

    expect(listRes.statusCode).toBe(200);
    const ids = listRes.json().items.map((p: { id: string }) => p.id);
    expect(ids).toContain(p1);
    expect(ids).toContain(p2);
    expect(ids).toContain(p3);
  });
});
