import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("S09-T01: Create immutable labeled history queries", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let viewer: { id: string; email: string };
  let outsider: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
    viewer = await fixture.seed();
    outsider = await fixture.seed();

    // Create project
    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`History Test ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    // Add main.tex file node
    const nodeRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind)
       VALUES ($1, 'main.tex', 'FILE', 'application/x-tex', 'TEXT') RETURNING id`,
      [projectId],
    );
    const fileId = nodeRes.rows[0]!.id;

    await fixture.db.query(`INSERT INTO text_documents (file_id, project_id) VALUES ($1, $2)`, [
      fileId,
      projectId,
    ]);

    // Add editor and viewer members
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, editor.id],
    );
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')`,
      [projectId, viewer.id],
    );

    // Create 3 revisions using RevisionsRepository
    const revRepo = new RevisionsRepository(fixture.db);
    await revRepo.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "manual",
      label: "Initial draft",
    });

    await revRepo.createStructuralRevision({
      projectId,
      authorId: editor.id,
      source: "compile",
      label: null,
    });

    await revRepo.createStructuralRevision({
      projectId,
      authorId: owner.id,
      source: "manual",
      label: "Submitted version",
    });
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

  it("lists paginated consistent revisions with author, label and source", async () => {
    const session = await getSession(owner.email);

    const res = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions?limit=2`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeDefined();

    // Revisions are sorted descending by revision_no (v3, then v2)
    expect(body.items[0].revisionNo).toBe(3);
    expect(body.items[0].label).toBe("Submitted version");
    expect(body.items[0].source).toBe("manual");
    expect(body.items[0].manifestHash).toBeDefined();

    expect(body.items[1].revisionNo).toBe(2);
    expect(body.items[1].label).toBeNull();
    expect(body.items[1].source).toBe("compile");

    // Fetch next page using cursor
    const resPage2 = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions?limit=2&cursor=${body.nextCursor}`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });

    expect(resPage2.statusCode).toBe(200);
    const body2 = resPage2.json();
    expect(body2.items).toHaveLength(1);
    expect(body2.items[0].revisionNo).toBe(1);
    expect(body2.items[0].label).toBe("Initial draft");
    expect(body2.nextCursor).toBeNull();
  });

  it("filters revisions by label query", async () => {
    const session = await getSession(viewer.email);

    const res = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions?label=Submitted`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].revisionNo).toBe(3);
    expect(body.items[0].label).toBe("Submitted version");
  });

  it("retrieves full single revision details", async () => {
    const session = await getSession(editor.email);

    const res = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions/1`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.revisionNo).toBe(1);
    expect(body.label).toBe("Initial draft");
    expect(body.manifest).toBeDefined();
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items[0].path).toBe("main.tex");
  });

  it("allows OWNER and EDITOR to update revision label without mutating manifest", async () => {
    const ownerSession = await getSession(owner.email);

    // Initial check of manifestHash
    const getRes1 = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions/2`,
      headers: { origin, cookie: ownerSession.cookie },
    });
    const originalHash = getRes1.json().manifestHash;

    // Editor updates label
    const editorSession = await getSession(editor.email);
    const labelRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/revisions/2/label`,
      headers: {
        origin,
        cookie: editorSession.cookie,
        "x-csrf-token": editorSession.csrf,
      },
      payload: { label: "Peer review milestone" },
    });

    expect(labelRes.statusCode).toBe(200);
    expect(labelRes.json().label).toBe("Peer review milestone");

    // Verify manifestHash is unchanged (immutable history)
    const getRes2 = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions/2`,
      headers: { origin, cookie: ownerSession.cookie },
    });
    expect(getRes2.json().manifestHash).toBe(originalHash);
    expect(getRes2.json().label).toBe("Peer review milestone");
  });

  it("denies label update by VIEWER and outside user", async () => {
    const viewerSession = await getSession(viewer.email);

    const resViewer = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/revisions/2/label`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
        "x-csrf-token": viewerSession.csrf,
      },
      payload: { label: "Unauthorized label" },
    });
    expect(resViewer.statusCode).toBe(403);

    const outsiderSession = await getSession(outsider.email);
    const resOutsider = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/revisions/2/label`,
      headers: {
        origin,
        cookie: outsiderSession.cookie,
        "x-csrf-token": outsiderSession.csrf,
      },
      payload: { label: "Outsider label" },
    });
    expect(resOutsider.statusCode).toBe(404);
  });
});
