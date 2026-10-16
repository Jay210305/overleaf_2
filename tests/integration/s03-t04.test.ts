import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S03-T04 ID-based file tree mutations integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let outsider: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    outsider = await fixture.seed();
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

  async function createTestProject() {
    const session = await getSession(owner.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        title: `Tree Test ${randomUUID()}`,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; mainFileId: string; currentRevision: number };
  }

  it("reads project node tree with version matching project current_revision", async () => {
    const session = await getSession(owner.email);
    const project = await createTestProject();

    const res = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projectId).toBe(project.id);
    expect(body.treeVersion).toBe(0);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("main.tex");
    expect(body.items[0].parentId).toBeNull();
  });

  it("creates folders and files and maintains text_documents records", async () => {
    const session = await getSession(owner.email);
    const project = await createTestProject();

    // 1. Create a folder at root
    const folderRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": '"0"',
      },
      payload: {
        name: "chapters",
        parentId: null,
        kind: "FOLDER",
      },
    });
    expect(folderRes.statusCode).toBe(201);
    const folder = folderRes.json();
    expect(folder.name).toBe("chapters");
    expect(folder.kind).toBe("FOLDER");
    expect(folder.treeVersion).toBe(1);

    // 2. Create a file inside chapters folder
    const fileRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": '"1"',
      },
      payload: {
        name: "intro.tex",
        parentId: folder.id,
        kind: "FILE",
        mime: "application/x-tex",
        contentKind: "TEXT",
      },
    });
    expect(fileRes.statusCode).toBe(201);
    const file = fileRes.json();
    expect(file.name).toBe("intro.tex");
    expect(file.parentId).toBe(folder.id);
    expect(file.treeVersion).toBe(2);

    // Verify text_documents entry was created
    const docRes = await fixture.db.query(
      `SELECT file_id, project_id FROM text_documents WHERE file_id = $1`,
      [file.id],
    );
    expect(docRes.rows).toHaveLength(1);
    expect(docRes.rows[0]!.project_id).toBe(project.id);
  });

  it("rejects unsafe node names and path traversals", async () => {
    const session = await getSession(owner.email);
    const project = await createTestProject();

    const unsafeNames = ["", " ", ".", "..", "../etc", "dir/child", "foo\\bar", "nul\0byte"];

    for (const name of unsafeNames) {
      const res = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/nodes`,
        headers: {
          origin,
          cookie: session.cookie,
          "x-csrf-token": session.csrf,
        },
        payload: {
          name,
          parentId: null,
          kind: "FOLDER",
        },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("rejects duplicate sibling names with 409 REVISION_CONFLICT", async () => {
    const session = await getSession(owner.email);
    const project = await createTestProject();

    // Sibling conflict at root (main.tex already exists)
    const dupRoot = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        name: "main.tex",
        parentId: null,
        kind: "FILE",
      },
    });
    expect(dupRoot.statusCode).toBe(409);

    // Create a folder
    const folderRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        name: "assets",
        parentId: null,
        kind: "FOLDER",
      },
    });
    const folder = folderRes.json();

    // Create a child in assets
    const child1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        name: "logo.png",
        parentId: folder.id,
        kind: "FILE",
        mime: "image/png",
        contentKind: "BINARY",
      },
    });
    expect(child1.statusCode).toBe(201);

    // Duplicate child in same folder
    const child2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        name: "logo.png",
        parentId: folder.id,
        kind: "FILE",
        mime: "image/png",
        contentKind: "BINARY",
      },
    });
    expect(child2.statusCode).toBe(409);
  });

  it("rejects creating or moving to a foreign parent or file node", async () => {
    const session = await getSession(owner.email);
    const project1 = await createTestProject();
    const project2 = await createTestProject();

    // Create folder in project 2
    const p2FolderRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project2.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        name: "foreign-folder",
        parentId: null,
        kind: "FOLDER",
      },
    });
    const p2Folder = p2FolderRes.json();

    // Try to create in project 1 with parent from project 2
    const foreignCreate = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project1.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        name: "intruder.tex",
        parentId: p2Folder.id,
        kind: "FILE",
      },
    });
    expect(foreignCreate.statusCode).toBe(404);

    // Try to create with parentId pointing to a FILE node
    const fileParent = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project1.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        name: "sub.tex",
        parentId: project1.mainFileId,
        kind: "FILE",
      },
    });
    expect(fileParent.statusCode).toBe(400);
  });

  it("handles rename and move with optimistic locking and cycle prevention", async () => {
    const session = await getSession(owner.email);
    const project = await createTestProject();

    // Create folder A
    const aRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { name: "folderA", parentId: null, kind: "FOLDER" },
    });
    const folderA = aRes.json();

    // Create folder B inside folder A
    const bRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { name: "folderB", parentId: folderA.id, kind: "FOLDER" },
    });
    const folderB = bRes.json();

    // 1. Rename folder A with stale If-Match -> 412
    const staleRename = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${folderA.id}/rename`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": '"0"',
      },
      payload: { name: "folderA_renamed" },
    });
    expect(staleRename.statusCode).toBe(412);

    // 2. Rename folder A with valid If-Match -> 200
    const validRename = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${folderA.id}/rename`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": `"${folderB.treeVersion}"`,
      },
      payload: { name: "folderA_renamed" },
    });
    expect(validRename.statusCode).toBe(200);
    expect(validRename.json().name).toBe("folderA_renamed");

    // 3. Move folder A into folder B (cycle!) -> 400
    const cycleMove = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${folderA.id}/move`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { targetParentId: folderB.id },
    });
    expect(cycleMove.statusCode).toBe(400);

    // 4. Move folder A to itself -> 400
    const selfMove = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${folderA.id}/move`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { targetParentId: folderA.id },
    });
    expect(selfMove.statusCode).toBe(400);

    // 5. Move folder B to root -> 200
    const rootMove = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${folderB.id}/move`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { targetParentId: null },
    });
    expect(rootMove.statusCode).toBe(200);
    expect(rootMove.json().parentId).toBeNull();
  });

  it("deletes node recursively with treeVersion increment and main_file_id cleanup", async () => {
    const session = await getSession(owner.email);
    const project = await createTestProject();

    // Create a folder and file inside it
    const folderRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { name: "toDelete", parentId: null, kind: "FOLDER" },
    });
    const folder = folderRes.json();

    const fileRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { name: "inner.tex", parentId: folder.id, kind: "FILE" },
    });
    const file = fileRes.json();

    // Delete with stale If-Match -> 412
    const staleDel = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/nodes/${folder.id}`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": '"0"',
      },
    });
    expect(staleDel.statusCode).toBe(412);

    // Delete with valid If-Match -> 204
    const validDel = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/nodes/${folder.id}`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": `"${file.treeVersion}"`,
      },
    });
    expect(validDel.statusCode).toBe(204);

    // Verify folder and child are marked deleted
    const nodes = await fixture.db.query(
      `SELECT id, deleted_at FROM project_nodes WHERE id IN ($1, $2)`,
      [folder.id, file.id],
    );
    expect(nodes.rows).toHaveLength(2);
    expect(nodes.rows[0]!.deleted_at).not.toBeNull();
    expect(nodes.rows[1]!.deleted_at).not.toBeNull();

    // Delete main.tex and check project.main_file_id is cleared
    const delMain = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/nodes/${project.mainFileId}`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
    });
    expect(delMain.statusCode).toBe(204);

    const projCheck = await fixture.db.query(`SELECT main_file_id FROM projects WHERE id = $1`, [
      project.id,
    ]);
    expect(projCheck.rows[0]!.main_file_id).toBeNull();
  });

  it("enforces server-side permissions on tree routes", async () => {
    const outsiderSession = await getSession(outsider.email);
    const project = await createTestProject();

    // Outsider GET nodes -> 404
    const outsiderGet = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: outsiderSession.cookie },
    });
    expect(outsiderGet.statusCode).toBe(404);

    // Outsider POST nodes -> 404
    const outsiderPost = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: outsiderSession.cookie,
        "x-csrf-token": outsiderSession.csrf,
      },
      payload: { name: "hacked.tex", parentId: null, kind: "FILE" },
    });
    expect(outsiderPost.statusCode).toBe(404);
  });
});
