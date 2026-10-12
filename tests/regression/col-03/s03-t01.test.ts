import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("COL-03 regression: Role permissions enforced on REST project routes (S03-T01)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };
  let outsider: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
    reviewer = await fixture.seed();
    viewer = await fixture.seed();
    outsider = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (owner_id, title) VALUES ($1, $2) RETURNING id`,
      [owner.id, `Collab Project ${randomUUID()}`],
    );
    projectId = projRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES
       ($1, $2, 'EDITOR'),
       ($1, $3, 'REVIEWER'),
       ($1, $4, 'VIEWER')`,
      [projectId, editor.id, reviewer.id, viewer.id],
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

  it("enforces READ on GET /projects/:projectId across roles", async () => {
    for (const user of [owner, editor, reviewer, viewer]) {
      const s = await getSession(user.email);
      const res = await fixture.app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectId}`,
        headers: { origin, cookie: s.cookie },
      });
      expect(res.statusCode).toBe(200);
    }

    const outsiderSession = await getSession(outsider.email);
    const outsiderRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: { origin, cookie: outsiderSession.cookie },
    });
    expect(outsiderRes.statusCode).toBe(404);
  });

  it("enforces EDIT permissions on PATCH /projects/:projectId", async () => {
    // EDITOR can edit project metadata
    const editorSession = await getSession(editor.email);
    const editRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        origin,
        cookie: editorSession.cookie,
        "x-csrf-token": editorSession.csrf,
        "if-match": '"0"',
      },
      payload: { description: "Edited by editor" },
    });
    expect(editRes.statusCode).toBe(200);

    // REVIEWER cannot edit project metadata (403)
    const reviewerSession = await getSession(reviewer.email);
    const revRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        origin,
        cookie: reviewerSession.cookie,
        "x-csrf-token": reviewerSession.csrf,
        "if-match": '"0"',
      },
      payload: { description: "Edited by reviewer" },
    });
    expect(revRes.statusCode).toBe(403);

    // VIEWER cannot edit project metadata (403)
    const viewerSession = await getSession(viewer.email);
    const viewRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
        "x-csrf-token": viewerSession.csrf,
        "if-match": '"0"',
      },
      payload: { description: "Edited by viewer" },
    });
    expect(viewRes.statusCode).toBe(403);
  });

  it("enforces DELETE permissions (only OWNER can delete)", async () => {
    // EDITOR cannot delete project (403)
    const editorSession = await getSession(editor.email);
    const edDel = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        origin,
        cookie: editorSession.cookie,
        "x-csrf-token": editorSession.csrf,
        "if-match": '"0"',
      },
    });
    expect(edDel.statusCode).toBe(403);

    // VIEWER cannot delete project (403)
    const viewerSession = await getSession(viewer.email);
    const viDel = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
        "x-csrf-token": viewerSession.csrf,
        "if-match": '"0"',
      },
    });
    expect(viDel.statusCode).toBe(403);
  });
});
