import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import {
  canEdit,
  isReadOnly,
  formatPermissionNotice,
} from "../../apps/web/src/features/editor/permissions.js";
import { checkTextRevisionConcurrency } from "../../apps/api/src/modules/files/version-guard.js";

describe("S04-T06 Enforce read-only and metadata concurrency integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editorUser: { id: string; email: string };
  let viewerUser: { id: string; email: string };
  let reviewerUser: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editorUser = await fixture.seed();
    viewerUser = await fixture.seed();
    reviewerUser = await fixture.seed();
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
      title: `GuardTest-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', NOW()),
              ($1, $3, 'VIEWER', NOW()),
              ($1, $4, 'REVIEWER', NOW())`,
      [proj.id, editorUser.id, viewerUser.id, reviewerUser.id],
    );

    return { projectId: proj.id, fileId: proj.mainFileId!, revision: proj.currentRevision };
  }

  it("Client permission helpers accurately classify roles", () => {
    expect(canEdit("OWNER")).toBe(true);
    expect(canEdit("EDITOR")).toBe(true);
    expect(canEdit("VIEWER")).toBe(false);
    expect(canEdit("REVIEWER")).toBe(false);

    expect(isReadOnly("VIEWER")).toBe(true);
    expect(isReadOnly("REVIEWER")).toBe(true);
    expect(isReadOnly("EDITOR")).toBe(false);

    expect(formatPermissionNotice("VIEWER")).toContain("VIEWER");
    expect(formatPermissionNotice("REVIEWER")).toContain("REVIEWER");
    expect(formatPermissionNotice("EDITOR")).toBeNull();
  });

  it("Server rejects VIEWER and REVIEWER text edits with 403", async () => {
    const { projectId, fileId } = await setupProject();

    const viewerSession = await getSession(viewerUser.email);
    const reviewerSession = await getSession(reviewerUser.email);

    // Initial doc update payload
    const dummyDoc = new Y.Doc();
    const updateB64 = Buffer.from(Y.encodeStateAsUpdate(dummyDoc)).toString("base64");
    const vectorB64 = Buffer.from(Y.encodeStateVector(dummyDoc)).toString("base64");

    // VIEWER attempt
    const vRes = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
        "x-csrf-token": viewerSession.csrf,
      },
      payload: {
        updateBase64: updateB64,
        baseStateVectorBase64: vectorB64,
      },
    });
    expect(vRes.statusCode).toBe(403);

    // REVIEWER attempt
    const rRes = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: reviewerSession.cookie,
        "x-csrf-token": reviewerSession.csrf,
      },
      payload: {
        updateBase64: updateB64,
        baseStateVectorBase64: vectorB64,
      },
    });
    expect(rRes.statusCode).toBe(403);
  });

  it("Server rejects stale metadata rename/move with 412 PRECONDITION_FAILED", async () => {
    const { projectId, fileId, revision } = await setupProject();
    const session = await getSession(editorUser.email);

    // Patch node with stale If-Match (e.g. revision + 99)
    const res = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectId}/nodes/${fileId}`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": `"${revision + 99}"`,
      },
      payload: {
        name: "renamed-main.tex",
      },
    });

    expect(res.statusCode).toBe(412);
  });

  it("Version guard utilities reject stale base vector with 409", () => {
    expect(() => checkTextRevisionConcurrency("actualVector", "actualVector")).not.toThrow();

    expect(() => checkTextRevisionConcurrency("actualVector", "staleVector")).toThrowError();
  });
});
