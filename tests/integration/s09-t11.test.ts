import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S09-T11: Implement permission-aware bulk project actions", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let userA: { id: string; email: string };
  let otherUser: { id: string; email: string };
  let ownedProject: string;
  let viewerProject: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    userA = await fixture.seed();
    otherUser = await fixture.seed();

    // Project 1: owned by userA
    const p1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Owned Project ${randomUUID()}`, userA.id],
    );
    ownedProject = p1.rows[0]!.id;

    // Project 2: owned by otherUser, userA is VIEWER
    const p2 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Other Project ${randomUUID()}`, otherUser.id],
    );
    viewerProject = p2.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')`,
      [viewerProject, userA.id],
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

  it("checks permissions per project independently: permits owned and denies viewer without cross-contamination", async () => {
    const session = await getSession(userA.email);

    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects/bulk",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: {
        projectIds: [ownedProject, viewerProject],
        action: "archive",
      },
    });

    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results).toHaveLength(2);

    // Owned project succeeds
    const ownedResult = results.find((r: { projectId: string }) => r.projectId === ownedProject);
    expect(ownedResult).toEqual({
      projectId: ownedProject,
      ok: true,
      errorCode: null,
    });

    // Viewer project is forbidden
    const viewerResult = results.find((r: { projectId: string }) => r.projectId === viewerProject);
    expect(viewerResult).toEqual({
      projectId: viewerProject,
      ok: false,
      errorCode: "PROJECT_PERMISSION_DENIED",
    });

    // Verify DB state: ownedProject is archived, viewerProject remains active
    const check1 = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [ownedProject],
    );
    expect(check1.rows[0]!.status).toBe("archived");

    const check2 = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [viewerProject],
    );
    expect(check2.rows[0]!.status).toBe("active");
  });

  it("bulk tagging applies to permitted projects and rejects viewer projects", async () => {
    const session = await getSession(userA.email);

    // Create a tag
    const tRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/tags",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "BulkTagTest", color: "#2196f3" },
    });
    const tagId = tRes.json().id;

    // Attempt bulk tag on owned and viewer
    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects/bulk",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: {
        projectIds: [ownedProject, viewerProject],
        action: "tag",
        tagId,
      },
    });

    expect(res.statusCode).toBe(200);
    const { results } = res.json();

    const rOwned = results.find((r: { projectId: string }) => r.projectId === ownedProject);
    expect(rOwned.ok).toBe(true);

    const rViewer = results.find((r: { projectId: string }) => r.projectId === viewerProject);
    expect(rViewer.ok).toBe(false);
    expect(rViewer.errorCode).toBe("PROJECT_PERMISSION_DENIED");

    // Link exists for owned, but not for viewer
    const l1 = await fixture.db.query(
      `SELECT * FROM project_tag_links WHERE project_id = $1 AND tag_id = $2`,
      [ownedProject, tagId],
    );
    expect(l1.rows.length).toBe(1);

    const l2 = await fixture.db.query(
      `SELECT * FROM project_tag_links WHERE project_id = $1 AND tag_id = $2`,
      [viewerProject, tagId],
    );
    expect(l2.rows.length).toBe(0);
  });
});
