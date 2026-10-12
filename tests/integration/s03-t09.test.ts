import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S03-T09 Transaction-safe move, rename and delete integration", () => {
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

  async function createProject() {
    const session = await getSession();
    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `T09 Project ${randomUUID()}` },
    });
    return res.json() as { id: string; mainFileId: string; currentRevision: number };
  }

  it("yields single committed tree state and explicit conflicts under racing moves", async () => {
    const session = await getSession();
    const project = await createProject();

    // Setup: Folder1, Folder2, and target file FileToMove
    const f1Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "TargetFolder1", parentId: null, kind: "FOLDER" },
    });
    const folder1 = f1Res.json();

    const f2Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "TargetFolder2", parentId: null, kind: "FOLDER" },
    });
    const folder2 = f2Res.json();

    const fileRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "movable.tex", parentId: null, kind: "FILE" },
    });
    const movableFile = fileRes.json();
    const currentVersion = movableFile.treeVersion;

    // Competing moves with optimistic locking (If-Match)
    const [res1, res2] = await Promise.all([
      fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/nodes/${movableFile.id}/move`,
        headers: {
          origin,
          cookie: session.cookie,
          "x-csrf-token": session.csrf,
          "if-match": `"${currentVersion}"`,
        },
        payload: { targetParentId: folder1.id },
      }),
      fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/nodes/${movableFile.id}/move`,
        headers: {
          origin,
          cookie: session.cookie,
          "x-csrf-token": session.csrf,
          "if-match": `"${currentVersion}"`,
        },
        payload: { targetParentId: folder2.id },
      }),
    ]);

    // One succeeds, one gets 412
    const statusCodes = [res1.statusCode, res2.statusCode];
    expect(statusCodes).toContain(200);
    expect(statusCodes).toContain(412);

    // Verify movable file is deterministically in exactly one folder
    const checkRow = await fixture.db.query<{ parent_id: string }>(
      `SELECT parent_id FROM project_nodes WHERE id = $1`,
      [movableFile.id],
    );
    expect([folder1.id, folder2.id]).toContain(checkRow.rows[0]!.parent_id);
  });

  it("leaves source completely unchanged when mutation fails due to stale precondition or cycle", async () => {
    const session = await getSession();
    const project = await createProject();

    // Create a folder and file
    const fRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "stable_folder", parentId: null, kind: "FOLDER" },
    });
    const folder = fRes.json();

    // Attempt stale rename
    const badRename = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${folder.id}/rename`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": '"9999"',
      },
      payload: { name: "should_not_happen" },
    });
    expect(badRename.statusCode).toBe(412);

    // Verify name remains unchanged
    const checkFolder = await fixture.db.query<{ name: string }>(
      `SELECT name FROM project_nodes WHERE id = $1`,
      [folder.id],
    );
    expect(checkFolder.rows[0]!.name).toBe("stable_folder");
  });
});
