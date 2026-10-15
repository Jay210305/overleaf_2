import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression PRO-12 (S09-T11): Bulk operations enforce permission independently per project", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let stranger: { id: string; email: string };
  let projectOwned: string;
  let projectForeign: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
    stranger = await fixture.seed();

    const p1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`PRO-12 User Project ${randomUUID()}`, user.id],
    );
    projectOwned = p1.rows[0]!.id;

    const p2 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`PRO-12 Foreign Project ${randomUUID()}`, stranger.id],
    );
    projectForeign = p2.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("never applies bulk mutations to projects where user is not a member or lacks owner role", async () => {
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects/bulk",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        projectIds: [projectOwned, projectForeign],
        action: "trash",
      },
    });

    expect(res.statusCode).toBe(200);
    const { results } = res.json();

    const rOwned = results.find((r: { projectId: string }) => r.projectId === projectOwned);
    expect(rOwned.ok).toBe(true);

    const rForeign = results.find((r: { projectId: string }) => r.projectId === projectForeign);
    expect(rForeign.ok).toBe(false);
    expect(rForeign.errorCode).toBe("RESOURCE_NOT_FOUND");

    // Foreign project in DB remains active
    const checkForeign = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [projectForeign],
    );
    expect(checkForeign.rows[0]!.status).toBe("active");
  });
});
