import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-04 regression: Tree hierarchy, cycle rejection, traversal guards and cascading deletion (S03-T08)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let outsider: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
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

  it("verifies PRO-04 deep tree mutations, cycle prevention, traversal prevention and cascade soft-deletion", async () => {
    const session = await getSession(user.email);
    const outsiderSession = await getSession(outsider.email);

    // 1. Create project
    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { title: `PRO-04 Deep Tree ${randomUUID()}` },
    });
    expect(projRes.statusCode).toBe(201);
    const project = projRes.json();

    // 2. Build multi-tier nested hierarchy:
    // root -> src -> chapters -> appendices -> appA.tex
    // root -> include -> macros.tex
    const srcRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "src", kind: "FOLDER", parentId: null },
    });
    expect(srcRes.statusCode).toBe(201);
    const srcFolder = srcRes.json();

    const chapRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "chapters", kind: "FOLDER", parentId: srcFolder.id },
    });
    expect(chapRes.statusCode).toBe(201);
    const chapFolder = chapRes.json();

    const appRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "appendices", kind: "FOLDER", parentId: chapFolder.id },
    });
    expect(appRes.statusCode).toBe(201);
    const appFolder = appRes.json();

    const appAFileRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "appA.tex", kind: "FILE", parentId: appFolder.id },
    });
    expect(appAFileRes.statusCode).toBe(201);
    const appAFile = appAFileRes.json();

    const incRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "include", kind: "FOLDER", parentId: null },
    });
    expect(incRes.statusCode).toBe(201);
    const incFolder = incRes.json();

    const macroRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "macros.tex", kind: "FILE", parentId: incFolder.id },
    });
    expect(macroRes.statusCode).toBe(201);
    const macroFile = macroRes.json();

    // 3. Move deep subtree: move 'appendices' from 'src/chapters' to 'include'
    const moveSubtreeRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${appFolder.id}/move`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": `"${macroFile.treeVersion}"`,
      },
      payload: { targetParentId: incFolder.id },
    });
    expect(moveSubtreeRes.statusCode).toBe(200);
    const movedApp = moveSubtreeRes.json();
    expect(movedApp.parentId).toBe(incFolder.id);

    // Verify appA.tex is still nested inside appendices
    const treeAfterMove = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie },
    });
    const treeItems = treeAfterMove.json().items;
    const appAItem = treeItems.find((n: { id: string }) => n.id === appAFile.id);
    expect(appAItem.parentId).toBe(appFolder.id);

    // 4. Cycle rejection: attempt to move 'include' into 'appendices' (which is inside 'include')
    const cycleRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${incFolder.id}/move`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { targetParentId: appFolder.id },
    });
    expect(cycleRes.statusCode).toBe(400);

    // Self cycle: attempt to move 'src' into 'src'
    const selfCycleRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${srcFolder.id}/move`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { targetParentId: srcFolder.id },
    });
    expect(selfCycleRes.statusCode).toBe(400);

    // 5. Traversal and unsafe names rejection:
    const traversalNames = ["../escape.tex", "foo/bar.tex", "/root.tex", "test\0.tex"];
    for (const badName of traversalNames) {
      const badRes = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/nodes`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: { name: badName, kind: "FILE", parentId: incFolder.id },
      });
      expect(badRes.statusCode).toBe(400);
    }

    // 6. Sibling duplicate name collision under same parent -> 409
    const dupRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "macros.tex", kind: "FILE", parentId: incFolder.id },
    });
    expect(dupRes.statusCode).toBe(409);

    // 7. Foreign project parent reference rejection
    const foreignProjRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: outsiderSession.cookie,
        "x-csrf-token": outsiderSession.csrf,
      },
      payload: { title: "Outsider Project" },
    });
    const foreignProject = foreignProjRes.json();

    const foreignNodeRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${foreignProject.id}/nodes`,
      headers: {
        origin,
        cookie: outsiderSession.cookie,
        "x-csrf-token": outsiderSession.csrf,
      },
      payload: { name: "foreign_folder", kind: "FOLDER", parentId: null },
    });
    const foreignFolder = foreignNodeRes.json();

    const crossParentRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "cross.tex", kind: "FILE", parentId: foreignFolder.id },
    });
    expect([400, 404]).toContain(crossParentRes.statusCode);

    // 8. Cascading soft-deletion of entire subtree
    // Deleting 'include' must soft-delete 'include', 'macros.tex', 'appendices', and 'appA.tex'
    const deleteIncRes = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/nodes/${incFolder.id}`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
    });
    expect(deleteIncRes.statusCode).toBe(204);

    const treeAfterDelete = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie },
    });
    const remainingNodeIds = treeAfterDelete.json().items.map((n: { id: string }) => n.id);
    expect(remainingNodeIds).not.toContain(incFolder.id);
    expect(remainingNodeIds).not.toContain(macroFile.id);
    expect(remainingNodeIds).not.toContain(appFolder.id);
    expect(remainingNodeIds).not.toContain(appAFile.id);
    // src and chapters are still present
    expect(remainingNodeIds).toContain(srcFolder.id);
    expect(remainingNodeIds).toContain(chapFolder.id);

    // 9. Re-creation of previously deleted name succeeds (soft deletion does not block reuse)
    const recreateIncRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "include", kind: "FOLDER", parentId: null },
    });
    expect(recreateIncRes.statusCode).toBe(201);
  });
});
