import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S03-T02 Duplicate and rename project sources integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user1: { id: string; email: string };
  let user2: { id: string; email: string };
  let outsider: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user1 = await fixture.seed();
    user2 = await fixture.seed();
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

  it("creates a blank project with valid main.tex", async () => {
    const s1 = await getSession(user1.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s1.cookie, "x-csrf-token": s1.csrf },
      payload: { title: "Blank Project" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe("Blank Project");
    expect(body.mainFileId).toBeDefined();

    const nodeRes = await fixture.db.query<{ name: string; kind: string }>(
      "SELECT name, kind FROM project_nodes WHERE id = $1",
      [body.mainFileId],
    );
    expect(nodeRes.rows[0]!.name).toBe("main.tex");
    expect(nodeRes.rows[0]!.kind).toBe("FILE");
  });

  it("creates project from existing templateId", async () => {
    const s1 = await getSession(user1.email);
    // Create source template project with extra file
    const tplRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s1.cookie, "x-csrf-token": s1.csrf },
      payload: { title: "Template Project", description: "Template Desc" },
    });
    const tpl = tplRes.json();

    // Add extra chapter node
    const chapterId = randomUUID();
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
       VALUES ($1, $2, NULL, 'chapter1.tex', 'FILE', 'application/x-tex', 'TEXT', 10)`,
      [chapterId, tpl.id],
    );

    // user2 instantiates project from templateId
    const s2 = await getSession(user2.email);
    const instRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s2.cookie, "x-csrf-token": s2.csrf },
      payload: { title: "Instantiated From Template", templateId: tpl.id },
    });
    expect(instRes.statusCode).toBe(201);
    const inst = instRes.json();
    expect(inst.ownerId).toBe(user2.id);
    expect(inst.title).toBe("Instantiated From Template");
    expect(inst.id).not.toBe(tpl.id);

    // Verify all nodes copied
    const nodes = await fixture.db.query<{ name: string }>(
      "SELECT name FROM project_nodes WHERE project_id = $1 ORDER BY name",
      [inst.id],
    );
    expect(nodes.rows.map((r) => r.name)).toEqual(["chapter1.tex", "main.tex"]);
  });

  it("clones project with hierarchy and excludes memberships/secrets", async () => {
    const s1 = await getSession(user1.email);
    const s2 = await getSession(user2.email);

    // Create source project with folder hierarchy and members
    const srcRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s1.cookie, "x-csrf-token": s1.csrf },
      payload: { title: "Source For Clone" },
    });
    const src = srcRes.json();

    // Add folder and nested file
    const folderId = randomUUID();
    const fileInFolderId = randomUUID();
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
       VALUES ($1, $2, NULL, 'sections', 'FOLDER', 'inode/directory', 'TEXT', 0)`,
      [folderId, src.id],
    );
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
       VALUES ($1, $2, $3, 'intro.tex', 'FILE', 'application/x-tex', 'TEXT', 25)`,
      [fileInFolderId, src.id, folderId],
    );

    // Add member and invitation to source project
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [src.id, user2.id],
    );
    await fixture.db.query(
      `INSERT INTO project_invitations (project_id, email_normalized, role, token_hash, expires_at, invited_by)
       VALUES ($1, 'secret@example.test', 'VIEWER', $3, now() + interval '1 day', $2)`,
      [src.id, user1.id, randomUUID()],
    );

    // user2 clones the project
    const cloneRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${src.id}/clone`,
      headers: {
        origin,
        cookie: s2.cookie,
        "x-csrf-token": s2.csrf,
        "idempotency-key": "clone-test-key-123456",
      },
      payload: { title: "Cloned Copy" },
    });
    expect(cloneRes.statusCode).toBe(201);
    const cloned = cloneRes.json();
    expect(cloned.ownerId).toBe(user2.id);
    expect(cloned.title).toBe("Cloned Copy");

    // Verify memberships and invitations did NOT copy
    const clonedMembers = await fixture.db.query(
      "SELECT * FROM project_members WHERE project_id = $1",
      [cloned.id],
    );
    expect(clonedMembers.rows).toHaveLength(0);

    const clonedInvites = await fixture.db.query(
      "SELECT * FROM project_invitations WHERE project_id = $1",
      [cloned.id],
    );
    expect(clonedInvites.rows).toHaveLength(0);

    // Verify folder hierarchy was preserved in cloned project
    const clonedNodes = await fixture.db.query<{
      id: string;
      parent_id: string | null;
      name: string;
      kind: string;
    }>("SELECT id, parent_id, name, kind FROM project_nodes WHERE project_id = $1", [cloned.id]);
    expect(clonedNodes.rows).toHaveLength(3); // main.tex, sections, intro.tex
    const folder = clonedNodes.rows.find((n) => n.name === "sections")!;
    const intro = clonedNodes.rows.find((n) => n.name === "intro.tex")!;
    expect(folder.kind).toBe("FOLDER");
    expect(intro.parent_id).toBe(folder.id);
  });

  it("rejects clone when user lacks read permission or idempotency-key is missing", async () => {
    const s1 = await getSession(user1.email);
    const outsiderSession = await getSession(outsider.email);

    const srcRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s1.cookie, "x-csrf-token": s1.csrf },
      payload: { title: "Private Project" },
    });
    const src = srcRes.json();

    // Outsider lacks read access -> 404
    const outRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${src.id}/clone`,
      headers: {
        origin,
        cookie: outsiderSession.cookie,
        "x-csrf-token": outsiderSession.csrf,
        "idempotency-key": "clone-key-1234567890",
      },
    });
    expect(outRes.statusCode).toBe(404);

    // Missing idempotency key -> 400
    const noKeyRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${src.id}/clone`,
      headers: { origin, cookie: s1.cookie, "x-csrf-token": s1.csrf },
    });
    expect(noKeyRes.statusCode).toBe(400);
  });
});
