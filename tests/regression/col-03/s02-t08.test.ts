import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("COL-03 current REST role enforcement", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let owner: Awaited<ReturnType<typeof fixture.seed>>;
  let editor: Awaited<ReturnType<typeof fixture.seed>>;
  let reviewer: Awaited<ReturnType<typeof fixture.seed>>;
  let viewer: Awaited<ReturnType<typeof fixture.seed>>;
  const privateValue = `compiler-input-${randomUUID()}`;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    [owner, editor, reviewer, viewer] = await Promise.all([
      fixture.seed(),
      fixture.seed(),
      fixture.seed(),
      fixture.seed(),
    ]);
    const project = await fixture.db.query<{ id: string }>(
      "INSERT INTO projects (owner_id, title) VALUES ($1, $2) RETURNING id",
      [owner.id, privateValue],
    );
    projectId = project.rows[0]!.id;
    for (const [user, role] of [
      [editor, "EDITOR"],
      [reviewer, "REVIEWER"],
      [viewer, "VIEWER"],
    ] as const)
      await fixture.db.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)",
        [projectId, user.id, role],
      );
    for (const action of ["COMPILE", "EXPORT"] as const)
      fixture.app.post(
        `/api/v1/projects/:projectId/s02-t08-${action.toLowerCase()}`,
        { config: { projectAction: action } },
        async () => ({ privateValue }),
      );
    fixture.app.get("/api/v1/projects/:projectId/s02-t08-unconfigured", async () => ({
      privateValue,
    }));
  });
  afterAll(async () => fixture.close());

  async function headers(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      origin,
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(response.headers["x-csrf-token"]),
    };
  }

  it("does not grant reviewer or viewer compiler/source access without persisted capability", async () => {
    for (const action of ["compile", "export"] as const) {
      const url = `/api/v1/projects/${projectId}/s02-t08-${action}`;
      for (const user of [owner, editor]) {
        const response = await fixture.app.inject({
          method: "POST",
          url,
          headers: await headers(user.email),
        });
        expect(response.statusCode, `${user.email} ${action}`).toBe(200);
      }
      for (const user of [reviewer, viewer]) {
        const response = await fixture.app.inject({
          method: "POST",
          url,
          headers: await headers(user.email),
        });
        expect(response.statusCode, `${user.email} ${action}`).toBe(403);
        expect(response.body).not.toContain(privateValue);
      }
    }
  });

  it("defaults an unconfigured project route to denial before its handler executes", async () => {
    const response = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/s02-t08-unconfigured`,
      headers: await headers(owner.email),
    });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain(privateValue);
  });
});
