import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-04 Regression - Transaction-safe move, rename and delete races", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession() {
    const response = await fixture.login(owner.email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("PRO-04: concurrent rename and delete races leave tree in a consistent state without phantom nodes", async () => {
    const session = await getSession();

    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `PRO-04 Race ${randomUUID()}` },
    });
    const project = projRes.json();

    // Create a file to race on
    const fileRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "target.tex", parentId: null, kind: "FILE" },
    });
    const file = fileRes.json();

    // Race DELETE vs RENAME
    const [delRes, renameRes] = await Promise.all([
      fixture.app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${project.id}/nodes/${file.id}`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      }),
      fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/nodes/${file.id}/rename`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: { name: "target_renamed.tex" },
      }),
    ]);

    // Either delete succeeded first (DELETE 204, RENAME 404),
    // or rename succeeded first (RENAME 200, DELETE 204 and file is deleted).
    expect([200, 404]).toContain(renameRes.statusCode);
    expect(delRes.statusCode).toBe(204);

    // In all outcomes, node is soft deleted
    const checkRow = await fixture.db.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM project_nodes WHERE id = $1`,
      [file.id],
    );
    expect(checkRow.rows[0]!.deleted_at).not.toBeNull();
  });
});
