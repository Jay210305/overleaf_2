import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-03 regression: Duplicate projects and persist ownership, dates and description (S03-T02)", () => {
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

  it("duplicates project with cloned ownership to current user and preserves description and compiler", async () => {
    const s1 = await getSession(user1.email);
    const s2 = await getSession(user2.email);

    // user1 creates project
    const createRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s1.cookie, "x-csrf-token": s1.csrf },
      payload: {
        title: "Original Project",
        description: "Important research description",
        compiler: "lualatex",
      },
    });
    const orig = createRes.json();

    // user1 grants user2 VIEW access
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')`,
      [orig.id, user2.id],
    );

    // user2 clones the project
    const cloneRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${orig.id}/clone`,
      headers: {
        origin,
        cookie: s2.cookie,
        "x-csrf-token": s2.csrf,
        "idempotency-key": "idempotent-clone-user2-key",
      },
      payload: { title: "User2 Cloned Version" },
    });
    expect(cloneRes.statusCode).toBe(201);
    const cloned = cloneRes.json();

    expect(cloned.ownerId).toBe(user2.id);
    expect(cloned.title).toBe("User2 Cloned Version");
    expect(cloned.description).toBe("Important research description");
    expect(cloned.compiler).toBe("lualatex");
    expect(cloned.status).toBe("active");
  });
});
