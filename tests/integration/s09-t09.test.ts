import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S09-T09: Archive, trash, restore, and permanent deletion", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
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

  async function createProject(title: string) {
    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [title, owner.id],
    );
    const projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, editor.id],
    );

    return projectId;
  }

  it("allows owner to archive and unarchive project", async () => {
    const projectId = await createProject(`Archive Test ${randomUUID()}`);
    const ownerSession = await getSession(owner.email);

    // 1. Archive
    const archRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/archive`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
    });
    expect(archRes.statusCode).toBe(200);
    expect(archRes.json().status).toBe("archived");

    // Verify DB
    const check1 = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(check1.rows[0]!.status).toBe("archived");

    // 2. Unarchive
    const unarchRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/unarchive`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
    });
    expect(unarchRes.statusCode).toBe(200);
    expect(unarchRes.json().status).toBe("active");

    const check2 = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(check2.rows[0]!.status).toBe("active");
  });

  it("allows owner to trash and restore project from trash", async () => {
    const projectId = await createProject(`Trash Test ${randomUUID()}`);
    const ownerSession = await getSession(owner.email);

    // 1. Move to trash
    const trashRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/trash`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
    });
    expect(trashRes.statusCode).toBe(204);

    const check1 = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(check1.rows[0]!.status).toBe("trashed");

    // 2. Restore from trash
    const restoreRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore-trash`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().status).toBe("active");

    const check2 = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(check2.rows[0]!.status).toBe("active");
  });

  it("handles permanent deletion: enforces trashed state, title confirmation, and owner permission", async () => {
    const title = `Perm Delete ${randomUUID()}`;
    const projectId = await createProject(title);
    const ownerSession = await getSession(owner.email);
    const editorSession = await getSession(editor.email);

    // 1. Non-owner cannot permanently delete (403)
    const resEd = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/permanent`,
      headers: { origin, cookie: editorSession.cookie, "x-csrf-token": editorSession.csrf },
    });
    expect(resEd.statusCode).toBe(403);

    // 2. Active project cannot be permanently deleted without being trashed first (409)
    const resActive = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/permanent`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
      payload: { confirmTitle: title },
    });
    expect(resActive.statusCode).toBe(409);

    // Move to trash first
    await fixture.db.query(`UPDATE projects SET status = 'trashed' WHERE id = $1`, [projectId]);

    // 3. Mismatched confirmTitle fails with 400
    const resMismatch = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/permanent`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
      payload: { confirmTitle: "Wrong Title" },
    });
    expect(resMismatch.statusCode).toBe(400);

    // 4. Exact matching confirmTitle permanently deletes project
    const resSuccess = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/permanent`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
      payload: { confirmTitle: title },
    });
    expect(resSuccess.statusCode).toBe(204);

    // Verify completely purged from database
    const checkDeleted = await fixture.db.query(
      `SELECT * FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(checkDeleted.rows.length).toBe(0);
  });
});
