import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S02-T08 current PostgreSQL tenancy decisions", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let outsiderProjectId: string;
  let owner: Awaited<ReturnType<typeof fixture.seed>>;
  let editor: Awaited<ReturnType<typeof fixture.seed>>;
  let reviewer: Awaited<ReturnType<typeof fixture.seed>>;
  let viewer: Awaited<ReturnType<typeof fixture.seed>>;
  let outsider: Awaited<ReturnType<typeof fixture.seed>>;
  const secret = `private-project-${randomUUID()}`;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    [owner, editor, reviewer, viewer, outsider] = await Promise.all([
      fixture.seed(),
      fixture.seed(),
      fixture.seed(),
      fixture.seed(),
      fixture.seed(),
    ]);
    const own = await fixture.db.query<{ id: string }>(
      "INSERT INTO projects (owner_id, title) VALUES ($1, $2) RETURNING id",
      [owner.id, secret],
    );
    projectId = own.rows[0]!.id;
    const foreign = await fixture.db.query<{ id: string }>(
      "INSERT INTO projects (owner_id, title) VALUES ($1, 'Outsider manuscript') RETURNING id",
      [outsider.id],
    );
    outsiderProjectId = foreign.rows[0]!.id;
    for (const [user, role] of [
      [editor, "EDITOR"],
      [reviewer, "REVIEWER"],
      [viewer, "VIEWER"],
    ] as const)
      await fixture.db.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)",
        [projectId, user.id, role],
      );
    fixture.app.get(
      "/api/v1/projects/:projectId/s02-t08-read",
      { config: { projectAction: "READ" } },
      async () => ({ title: secret }),
    );
    fixture.app.post(
      "/api/v1/projects/:projectId/s02-t08-edit",
      { config: { projectAction: "EDIT" } },
      async () => ({ edited: secret }),
    );
    fixture.app.post(
      "/api/v1/projects/:projectId/s02-t08-restore",
      { config: { projectAction: "RESTORE" } },
      async () => ({ restored: secret }),
    );
  });
  afterAll(async () => fixture.close());

  async function session(email: string) {
    const login = await fixture.login(email);
    expect(login.statusCode).toBe(200);
    return {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(login.headers["x-csrf-token"]),
    };
  }

  it("allows the four roles to read but rechecks role and revocation on every request", async () => {
    for (const user of [owner, editor, reviewer, viewer]) {
      const headers = await session(user.email);
      const response = await fixture.app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectId}/s02-t08-read`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ title: secret });
    }
    const editorHeaders = await session(editor.email);
    const editUrl = `/api/v1/projects/${projectId}/s02-t08-edit`;
    expect(
      (await fixture.app.inject({ method: "POST", url: editUrl, headers: editorHeaders }))
        .statusCode,
    ).toBe(200);
    await fixture.db.query(
      "UPDATE project_members SET role = 'VIEWER' WHERE project_id = $1 AND user_id = $2",
      [projectId, editor.id],
    );
    const downgraded = await fixture.app.inject({
      method: "POST",
      url: editUrl,
      headers: editorHeaders,
    });
    expect(downgraded.statusCode).toBe(403);
    expect(downgraded.body).not.toContain(secret);
    await fixture.db.query(
      "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
      [projectId, editor.id],
    );
    const revoked = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/s02-t08-read`,
      headers: editorHeaders,
    });
    expect(revoked.statusCode).toBe(404);
    expect(revoked.body).not.toContain(secret);
  });

  it("hides foreign and suspended projects while permitting owner restore", async () => {
    const ownerHeaders = await session(owner.email);
    const outsiderHeaders = await session(outsider.email);
    const readUrl = `/api/v1/projects/${projectId}/s02-t08-read`;
    for (const [url, headers] of [
      [readUrl, outsiderHeaders],
      [`/api/v1/projects/${outsiderProjectId}/s02-t08-read`, ownerHeaders],
    ] as const) {
      const denied = await fixture.app.inject({ method: "GET", url, headers });
      expect(denied.statusCode).toBe(404);
      expect(denied.body).not.toContain(secret);
    }
    await fixture.db.query("UPDATE projects SET status = 'archived' WHERE id = $1", [projectId]);
    const hidden = await fixture.app.inject({ method: "GET", url: readUrl, headers: ownerHeaders });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).not.toContain(secret);
    const viewerHeaders = await session(viewer.email);
    const restoreUrl = `/api/v1/projects/${projectId}/s02-t08-restore`;
    const deniedRestore = await fixture.app.inject({
      method: "POST",
      url: restoreUrl,
      headers: viewerHeaders,
    });
    expect(deniedRestore.statusCode).toBe(403);
    expect(deniedRestore.body).not.toContain(secret);
    const allowedRestore = await fixture.app.inject({
      method: "POST",
      url: restoreUrl,
      headers: ownerHeaders,
    });
    expect(allowedRestore.statusCode).toBe(200);
  });
});
