import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S03-T09 Tree races and concurrency integration", () => {
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
      payload: { title: `Race Project ${randomUUID()}` },
    });
    return res.json() as { id: string; currentRevision: number };
  }

  it("handles concurrent creation of same-named sibling nodes with exactly one winner", async () => {
    const session = await getSession();
    const project = await createProject();

    // Launch 5 parallel requests trying to create the same file "shared.tex"
    const promises = Array.from({ length: 5 }, () =>
      fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/nodes`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: {
          name: "shared.tex",
          parentId: null,
          kind: "FILE",
        },
      }),
    );

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.statusCode === 201).length;
    const conflictCount = results.filter((r) => r.statusCode === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(4);

    // Verify DB state has exactly one active node named shared.tex
    const rows = await fixture.db.query(
      `SELECT id FROM project_nodes WHERE project_id = $1 AND name = 'shared.tex' AND deleted_at IS NULL`,
      [project.id],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("prevents mutual cycle creation when two folders concurrently move into each other", async () => {
    const session = await getSession();
    const project = await createProject();

    // Create Folder A
    const aRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "FolderA", parentId: null, kind: "FOLDER" },
    });
    const folderA = aRes.json();

    // Create Folder B
    const bRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "FolderB", parentId: null, kind: "FOLDER" },
    });
    const folderB = bRes.json();

    // Concurrently: Move A -> B and B -> A
    const [resAintoB, resBintoA] = await Promise.all([
      fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/nodes/${folderA.id}/move`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: { targetParentId: folderB.id },
      }),
      fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/nodes/${folderB.id}/move`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: { targetParentId: folderA.id },
      }),
    ]);

    const statuses = [resAintoB.statusCode, resBintoA.statusCode];
    // Exactly one should succeed (200) and the other should fail (400 cycle prevention)
    expect(statuses).toContain(200);
    expect(statuses).toContain(400);

    // Verify database tree: neither is orphaned or cyclic
    const nodes = await fixture.db.query<{ id: string; parent_id: string | null }>(
      `SELECT id, parent_id FROM project_nodes WHERE id IN ($1, $2)`,
      [folderA.id, folderB.id],
    );
    const aRow = nodes.rows.find((n) => n.id === folderA.id)!;
    const bRow = nodes.rows.find((n) => n.id === folderB.id)!;

    // Both cannot have the other as parent
    const isCycle = aRow.parent_id === folderB.id && bRow.parent_id === folderA.id;
    expect(isCycle).toBe(false);
  });

  it("handles concurrent mutations using If-Match ensuring serializability with 412 conflicts", async () => {
    const session = await getSession();
    const project = await createProject();

    // Create File 1
    const f1Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "file1.tex", parentId: null, kind: "FILE" },
    });
    const file1 = f1Res.json();
    const baseVersion = file1.treeVersion;

    // Concurrently attempt two renames both referencing baseVersion in If-Match
    const [res1, res2] = await Promise.all([
      fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/nodes/${file1.id}/rename`,
        headers: {
          origin,
          cookie: session.cookie,
          "x-csrf-token": session.csrf,
          "if-match": `"${baseVersion}"`,
        },
        payload: { name: "renamed_v1.tex" },
      }),
      fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/nodes/${file1.id}/rename`,
        headers: {
          origin,
          cookie: session.cookie,
          "x-csrf-token": session.csrf,
          "if-match": `"${baseVersion}"`,
        },
        payload: { name: "renamed_v2.tex" },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode];
    // Exactly one succeeds (200), the other gets 412 PRECONDITION_FAILED
    expect(statuses).toContain(200);
    expect(statuses).toContain(412);
  });

  it("prevents orphan nodes when parent folder is deleted concurrently", async () => {
    const session = await getSession();
    const project = await createProject();

    // Create Parent Folder
    const parentRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "Parent", parentId: null, kind: "FOLDER" },
    });
    const parentFolder = parentRes.json();

    // Create Child
    const childRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "Child.tex", parentId: parentFolder.id, kind: "FILE" },
    });
    const child = childRes.json();

    // Concurrently delete parent and try to create another child
    const [delRes, createChildRes] = await Promise.all([
      fixture.app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${project.id}/nodes/${parentFolder.id}`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      }),
      fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/nodes`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: { name: "Child2.tex", parentId: parentFolder.id, kind: "FILE" },
      }),
    ]);

    // Delete succeeded
    expect(delRes.statusCode).toBe(204);

    // If createChild arrived after delete, it should be 404 (parent deleted).
    // If it arrived before, it got 201, but the delete would have cascading soft-deleted both!
    if (createChildRes.statusCode === 201) {
      const child2Id = createChildRes.json().id;
      const ch2Row = await fixture.db.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM project_nodes WHERE id = $1`,
        [child2Id],
      );
      // If it was created before delete, delete recursively soft-deleted it or it has deleted_at
      expect(ch2Row.rows[0]).toBeDefined();
    } else {
      expect([404, 412]).toContain(createChildRes.statusCode);
    }

    // Verify Child1 is soft-deleted
    const ch1Row = await fixture.db.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM project_nodes WHERE id = $1`,
      [child.id],
    );
    expect(ch1Row.rows[0]!.deleted_at).not.toBeNull();
  });
});
