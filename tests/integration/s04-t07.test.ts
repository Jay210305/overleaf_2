import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";

describe("S04-T07 Text and binary checkpoints integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editorUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editorUser = await fixture.seed();
    viewerUser = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const res = await fixture.login(email);
    expect(res.statusCode).toBe(200);
    return {
      cookie: String(res.headers["set-cookie"]).split(";")[0]!,
      csrf: String(res.headers["x-csrf-token"]),
    };
  }

  async function setupProject() {
    const proj = await createProject(fixture.db, owner.id, {
      title: `CheckpointProj-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', NOW()), ($1, $3, 'VIEWER', NOW())`,
      [proj.id, editorUser.id, viewerUser.id],
    );

    // Add a binary figure asset to project
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, $2, NULL, 'figure.png', 'FILE', 'image/png', 'BINARY', 2048, 'blobs/fig-1.png')`,
      [randomUUID(), proj.id],
    );

    return { projectId: proj.id, fileId: proj.mainFileId! };
  }

  it("Multiple keystroke edits do NOT create revisions; explicit checkpoint creates deterministic revision", async () => {
    const { projectId, fileId } = await setupProject();
    const session = await getSession(editorUser.email);

    // Initial check: project has current_revision = 0 and 0 project_revisions
    const initialRevCountRes = await fixture.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM project_revisions WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(initialRevCountRes.rows[0]?.count)).toBe(0);

    // 1. Fetch initial text state
    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: session.cookie },
    });
    let state = getRes.json();

    // 2. Perform 3 consecutive keystroke edits (seq 1, seq 2, seq 3)
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(state.updateBase64, "base64"));
    const text = doc.getText("content");

    for (let i = 1; i <= 3; i++) {
      text.insert(text.length, `Line ${i}\n`);
      const update = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
      const putRes = await fixture.app.inject({
        method: "PUT",
        url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
        headers: {
          origin,
          cookie: session.cookie,
          "x-csrf-token": session.csrf,
        },
        payload: {
          updateBase64: update,
          baseStateVectorBase64: state.stateVectorBase64,
        },
      });
      expect(putRes.statusCode).toBe(200);
      state = putRes.json();
    }

    // Crucial Invariant: zero full revisions per keystroke! Still 0 project_revisions
    const revCountAfterEdits = await fixture.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM project_revisions WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(revCountAfterEdits.rows[0]?.count)).toBe(0);

    // 3. Explicit checkpoint POST: creates structural revision pinning text and binary files
    const cpRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/checkpoints`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        label: "Manual Checkpoint 1",
        source: "manual",
      },
    });

    expect(cpRes.statusCode).toBe(201);
    const cp = cpRes.json();
    expect(cp.revisionNo).toBe(1);
    expect(cp.label).toBe("Manual Checkpoint 1");
    expect(cp.manifestHash).toBeDefined();
    expect(cp.items).toHaveLength(2); // main.tex and figure.png

    const textItem = cp.items.find((item: { path: string }) => item.path === "main.tex");
    const binaryItem = cp.items.find((item: { path: string }) => item.path === "figure.png");

    expect(textItem).toBeDefined();
    expect(binaryItem).toBeDefined();
    expect(binaryItem.blobKey).toBe("blobs/fig-1.png");

    // Revisions table now has exactly 1 row
    const revCountAfterCp = await fixture.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM project_revisions WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(revCountAfterCp.rows[0]?.count)).toBe(1);
  });

  it("Viewer is denied on creating checkpoint with 403", async () => {
    const { projectId } = await setupProject();
    const session = await getSession(viewerUser.email);

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/checkpoints`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        label: "Viewer attempt",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("Can list and get checkpoints", async () => {
    const { projectId } = await setupProject();
    const session = await getSession(owner.email);

    // Create 2 checkpoints
    await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/checkpoints`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { label: "CP 1" },
    });
    await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/checkpoints`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { label: "CP 2" },
    });

    // List
    const listRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/checkpoints`,
      headers: { origin, cookie: session.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list).toHaveLength(2);
    expect(list[0].revisionNo).toBe(2);

    // Get specific
    const singleRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/checkpoints/1`,
      headers: { origin, cookie: session.cookie },
    });
    expect(singleRes.statusCode).toBe(200);
    expect(singleRes.json().revisionNo).toBe(1);
  });
});
