import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S03-T06 Project root and compiler settings integration", () => {
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

  async function createProject() {
    const session = await getSession(owner.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `Settings Project ${randomUUID()}` },
    });
    return res.json() as { id: string; mainFileId: string; currentRevision: number };
  }

  it("reads project settings with defaults", async () => {
    const session = await getSession(owner.email);
    const project = await createProject();

    const res = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie },
    });

    expect(res.statusCode).toBe(200);
    const settings = res.json();
    expect(settings.projectId).toBe(project.id);
    expect(settings.mainFileId).toBe(project.mainFileId);
    expect(settings.compiler).toBe("pdflatex");
    expect(settings.texliveImageVersion).toBe("2024.1");
    expect(settings.timeoutSeconds).toBe(30);
  });

  it("updates compiler and mainFileId to valid active .tex file", async () => {
    const session = await getSession(owner.email);
    const project = await createProject();

    // Create a second .tex file
    const nodeRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "paper.tex", parentId: null, kind: "FILE", mime: "application/x-tex" },
    });
    const paperFile = nodeRes.json();

    // Update settings
    const patchRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": `"${paperFile.treeVersion}"`,
      },
      payload: {
        mainFileId: paperFile.id,
        compiler: "xelatex",
        autoCompile: true,
        timeoutSeconds: 60,
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const updated = patchRes.json();
    expect(updated.mainFileId).toBe(paperFile.id);
    expect(updated.compiler).toBe("xelatex");
    expect(updated.autoCompile).toBe(true);
    expect(updated.timeoutSeconds).toBe(60);

    // Verify DB updated
    const dbProj = await fixture.db.query<{ main_file_id: string; compiler: string }>(
      `SELECT main_file_id, compiler FROM projects WHERE id = $1`,
      [project.id],
    );
    expect(dbProj.rows[0]!.main_file_id).toBe(paperFile.id);
    expect(dbProj.rows[0]!.compiler).toBe("xelatex");
  });

  it("rejects non-.tex or foreign node as root document", async () => {
    const session = await getSession(owner.email);
    const project1 = await createProject();
    const project2 = await createProject();

    // Create a non-.tex file in project1
    const imgRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project1.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: {
        name: "figure.png",
        parentId: null,
        kind: "FILE",
        mime: "image/png",
        contentKind: "BINARY",
      },
    });
    const imgFile = imgRes.json();

    // 1. Setting non-.tex file as root -> 400
    const nonTexPatch = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project1.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { mainFileId: imgFile.id },
    });
    expect(nonTexPatch.statusCode).toBe(400);

    // 2. Setting foreign .tex file from project2 as root -> 400
    const foreignPatch = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project1.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { mainFileId: project2.mainFileId },
    });
    expect(foreignPatch.statusCode).toBe(400);
  });

  it("enforces compiler allowlist and bounds timeout policy", async () => {
    const session = await getSession(owner.email);
    const project = await createProject();

    // Disallowed compiler
    const badEngine = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { compiler: "arbitrary-exec" },
    });
    expect(badEngine.statusCode).toBe(400);

    // Bounded timeout policy: 999999 exceeds maximum of 120s
    const excessiveTimeout = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { timeoutSeconds: 999999 },
    });
    expect(excessiveTimeout.statusCode).toBe(400);
  });

  it("rejects update with stale If-Match and enforces authorization", async () => {
    const session = await getSession(owner.email);
    const outsiderSession = await getSession(outsider.email);
    const project = await createProject();

    // Stale If-Match -> 412
    const staleRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": '"999"',
      },
      payload: { compiler: "latex" },
    });
    expect(staleRes.statusCode).toBe(412);

    // Outsider access -> 404
    const outsiderRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: outsiderSession.cookie },
    });
    expect(outsiderRes.statusCode).toBe(404);
  });
});
