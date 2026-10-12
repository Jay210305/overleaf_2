import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-04 Regression - ID-based file tree hierarchy and cycle rejection", () => {
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

  it("PRO-04: prevents multi-hop cycle creation in directory hierarchy", async () => {
    const session = await getSession();

    // 1. Create project
    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `PRO-04 Cycle Test ${randomUUID()}` },
    });
    const project = projRes.json();

    // 2. Create Dir1 at root
    const d1Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "Dir1", parentId: null, kind: "FOLDER" },
    });
    const dir1 = d1Res.json();

    // 3. Create Dir2 in Dir1
    const d2Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "Dir2", parentId: dir1.id, kind: "FOLDER" },
    });
    const dir2 = d2Res.json();

    // 4. Create Dir3 in Dir2
    const d3Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "Dir3", parentId: dir2.id, kind: "FOLDER" },
    });
    const dir3 = d3Res.json();

    // 5. Attempt to move Dir1 into Dir3 (3-hop cycle)
    const moveRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${dir1.id}/move`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { targetParentId: dir3.id },
    });
    expect(moveRes.statusCode).toBe(400);

    // Verify tree remains unchanged: Dir1 parent is still null
    const checkD1 = await fixture.db.query<{ parent_id: string | null }>(
      `SELECT parent_id FROM project_nodes WHERE id = $1`,
      [dir1.id],
    );
    expect(checkD1.rows[0]!.parent_id).toBeNull();
  });

  it("PRO-04: rejects path traversal and enforces strict ID hierarchy", async () => {
    const session = await getSession();

    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `PRO-04 Traversal Test ${randomUUID()}` },
    });
    const project = projRes.json();

    // Traversal names must be rejected with 400
    const invalidNames = ["..", ".", "../escape", "subdir/file.tex", "\\windows\\style.tex"];
    for (const name of invalidNames) {
      const res = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/nodes`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: { name, parentId: null, kind: "FILE" },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("PRO-04: enforces unique active sibling names and allows reusing deleted names", async () => {
    const session = await getSession();

    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `PRO-04 Unique Sibling Test ${randomUUID()}` },
    });
    const project = projRes.json();

    // Create file
    const f1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "unique.tex", parentId: null, kind: "FILE" },
    });
    expect(f1.statusCode).toBe(201);
    const node1 = f1.json();

    // Duplicate fails with 409
    const f2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "unique.tex", parentId: null, kind: "FILE" },
    });
    expect(f2.statusCode).toBe(409);

    // Delete first node
    const del = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/nodes/${node1.id}`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
    });
    expect(del.statusCode).toBe(204);

    // Now re-creating with the same name succeeds because previous is soft-deleted
    const f3 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "unique.tex", parentId: null, kind: "FILE" },
    });
    expect(f3.statusCode).toBe(201);
  });
});
