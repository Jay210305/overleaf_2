import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S03-T01 Project CRUD and pagination integration", () => {
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

  it("creates a new project with valid main.tex and text_documents entry", async () => {
    const session = await getSession(owner.email);
    const title = `Project ${randomUUID()}`;

    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        title,
        description: "Initial description",
        compiler: "pdflatex",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe(title);
    expect(body.ownerId).toBe(owner.id);
    expect(body.status).toBe("active");
    expect(body.currentRevision).toBe(0);
    expect(body.mainFileId).toBeDefined();

    // Verify main.tex was created in database
    const nodes = await fixture.db.query<{ id: string; name: string; kind: string }>(
      "SELECT id, name, kind FROM project_nodes WHERE project_id = $1",
      [body.id],
    );
    expect(nodes.rows).toHaveLength(1);
    expect(nodes.rows[0]!.name).toBe("main.tex");
    expect(nodes.rows[0]!.id).toBe(body.mainFileId);

    // Verify text_documents record was created
    const docs = await fixture.db.query<{ file_id: string }>(
      "SELECT file_id FROM text_documents WHERE project_id = $1",
      [body.id],
    );
    expect(docs.rows).toHaveLength(1);
    expect(docs.rows[0]!.file_id).toBe(body.mainFileId);
  });

  it("rejects project creation with unsafe title or invalid body", async () => {
    const session = await getSession(owner.email);

    // Empty title
    const res1 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { title: "   " },
    });
    expect(res1.statusCode).toBe(400);

    // Control characters / NUL
    const res2 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { title: "Malicious\0Project" },
    });
    expect(res2.statusCode).toBe(400);

    // Unknown fields
    const res3 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { title: "Valid Title", maliciousField: true },
    });
    expect(res3.statusCode).toBe(400);
  });

  it("requires session and CSRF for project creation", async () => {
    // No session
    const res1 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin },
      payload: { title: "No Session" },
    });
    expect(res1.statusCode).toBe(401);

    // Session without CSRF
    const session = await getSession(owner.email);
    const res2 = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie },
      payload: { title: "Missing CSRF" },
    });
    expect(res2.statusCode).toBe(403);
  });

  it("lists projects with pagination, filters and search", async () => {
    const session = await getSession(owner.email);

    // Create 3 projects
    const p1 = `Alpha Searchable ${randomUUID()}`;
    const p2 = `Beta Searchable ${randomUUID()}`;
    const p3 = `Gamma Other ${randomUUID()}`;

    for (const title of [p1, p2, p3]) {
      const res = await fixture.app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: {
          origin,
          cookie: session.cookie,
          "x-csrf-token": session.csrf,
        },
        payload: { title },
      });
      expect(res.statusCode).toBe(201);
    }

    // List with search query q="Searchable"
    const searchRes = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/projects?q=Searchable&filter=owned",
      headers: { origin, cookie: session.cookie },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = searchRes.json();
    expect(searchBody.items.length).toBeGreaterThanOrEqual(2);
    for (const item of searchBody.items) {
      expect(item.title).toContain("Searchable");
    }

    // List with limit 1
    const page1 = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/projects?limit=1&filter=owned",
      headers: { origin, cookie: session.cookie },
    });
    expect(page1.statusCode).toBe(200);
    const page1Body = page1.json();
    expect(page1Body.items).toHaveLength(1);
    expect(page1Body.nextCursor).not.toBeNull();

    // Page 2 using cursor
    const page2 = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?limit=1&filter=owned&cursor=${encodeURIComponent(page1Body.nextCursor)}`,
      headers: { origin, cookie: session.cookie },
    });
    expect(page2.statusCode).toBe(200);
    const page2Body = page2.json();
    expect(page2Body.items).toHaveLength(1);
    expect(page2Body.items[0]!.id).not.toBe(page1Body.items[0]!.id);
  });

  it("supports reading, updating and deleting a project with If-Match check", async () => {
    const ownerSession = await getSession(owner.email);
    const outsiderSession = await getSession(outsider.email);

    // Create project
    const createRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
      },
      payload: { title: "CRUD Project", description: "Original" },
    });
    const proj = createRes.json();
    const projectId = proj.id;

    // Read by owner
    const readRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: { origin, cookie: ownerSession.cookie },
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().title).toBe("CRUD Project");

    // Read by outsider returns 404 (anti-enumeration)
    const outsiderRead = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: { origin, cookie: outsiderSession.cookie },
    });
    expect(outsiderRead.statusCode).toBe(404);

    // Update with invalid If-Match
    const badIfMatch = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "if-match": '"999"',
      },
      payload: { title: "New Title" },
    });
    expect(badIfMatch.statusCode).toBe(412);

    // Update with valid If-Match
    const updateRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "if-match": '"0"',
      },
      payload: { title: "Updated Title", description: "Updated description" },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().title).toBe("Updated Title");
    expect(updateRes.json().description).toBe("Updated description");

    // Delete project by owner
    const delRes = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "if-match": '"0"',
      },
    });
    expect(delRes.statusCode).toBe(204);

    // Read after soft delete returns 404
    const readAfterDel = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}`,
      headers: { origin, cookie: ownerSession.cookie },
    });
    expect(readAfterDel.statusCode).toBe(404);
  });
});
