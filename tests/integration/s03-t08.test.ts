import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RevisionsRepository } from "@latex-collab/db";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S03-T08 Verify project and tree journey integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let alice: { id: string; email: string };
  let eve: { id: string; email: string };
  let revisionsRepo: RevisionsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    alice = await fixture.seed();
    eve = await fixture.seed();
    revisionsRepo = new RevisionsRepository(fixture.db);
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

  it("completes full project and tree journey: create, rename, mutate nodes, reload persistence, tenant isolation and delete", async () => {
    const aliceSession = await getSession(alice.email);
    const eveSession = await getSession(eve.email);

    // 1. CREATE PROJECT (Alice)
    const createProjectRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        title: `Journey Paper ${randomUUID()}`,
        description: "Initial journey paper description",
      },
    });
    expect(createProjectRes.statusCode).toBe(201);
    const project = createProjectRes.json() as {
      id: string;
      title: string;
      mainFileId: string;
      compiler: string;
      currentRevision: number;
    };
    expect(project.id).toBeDefined();
    expect(project.compiler).toBe("pdflatex");
    expect(project.currentRevision).toBe(0);

    // 2. OPEN AND INSPECT INITIAL TREE
    const initialTreeRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(initialTreeRes.statusCode).toBe(200);
    const initialTree = initialTreeRes.json();
    expect(initialTree.projectId).toBe(project.id);
    expect(initialTree.treeVersion).toBe(0);
    expect(initialTree.items).toHaveLength(1);
    expect(initialTree.items[0].name).toBe("main.tex");
    expect(initialTree.items[0].parentId).toBeNull();
    const mainFileNodeId = initialTree.items[0].id;
    expect(mainFileNodeId).toBe(project.mainFileId);

    // 3. RENAME PROJECT
    const updatedTitle = `Renamed Journey Paper ${randomUUID()}`;
    const renameProjRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
        "if-match": '"0"',
      },
      payload: {
        title: updatedTitle,
      },
    });
    expect(renameProjRes.statusCode).toBe(200);
    expect(renameProjRes.json().title).toBe(updatedTitle);

    // Verify project title persists on GET
    const getProjRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(getProjRes.statusCode).toBe(200);
    expect(getProjRes.json().title).toBe(updatedTitle);

    // 4. CREATE NODES (folders and nested files)
    // 4a. Create folder 'chapters' at root
    const createChaptersRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        name: "chapters",
        kind: "FOLDER",
        parentId: null,
      },
    });
    expect(createChaptersRes.statusCode).toBe(201);
    const chaptersFolder = createChaptersRes.json();
    expect(chaptersFolder.name).toBe("chapters");
    expect(chaptersFolder.kind).toBe("FOLDER");
    expect(chaptersFolder.treeVersion).toBe(1);

    // 4b. Create file 'ch1.tex' inside 'chapters'
    const createCh1Res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        name: "ch1.tex",
        kind: "FILE",
        parentId: chaptersFolder.id,
      },
    });
    expect(createCh1Res.statusCode).toBe(201);
    const ch1File = createCh1Res.json();
    expect(ch1File.name).toBe("ch1.tex");
    expect(ch1File.parentId).toBe(chaptersFolder.id);
    expect(ch1File.treeVersion).toBe(2);

    // 4c. Create folder 'figures' at root
    const createFiguresRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        name: "figures",
        kind: "FOLDER",
        parentId: null,
      },
    });
    expect(createFiguresRes.statusCode).toBe(201);
    const figuresFolder = createFiguresRes.json();
    expect(figuresFolder.treeVersion).toBe(3);

    // 5. TEST INVALID MUTATIONS: STATE MUST REMAIN COMPLETELY UNCHANGED
    // 5a. Sibling name collision (duplicate 'ch1.tex' inside chapters) -> 409
    const dupRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        name: "ch1.tex",
        kind: "FILE",
        parentId: chaptersFolder.id,
      },
    });
    expect(dupRes.statusCode).toBe(409);

    // 5b. Unsafe path traversal in node name -> 400
    const traversalRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        name: "../evil.tex",
        kind: "FILE",
        parentId: chaptersFolder.id,
      },
    });
    expect(traversalRes.statusCode).toBe(400);

    // 5c. Multi-hop or self cycle (move chapters into itself) -> 400
    const cycleRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${chaptersFolder.id}/move`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        targetParentId: chaptersFolder.id,
      },
    });
    expect(cycleRes.statusCode).toBe(400);

    // 5d. Foreign parent injection (create Eve's project, try using Eve's folder parentId in Alice's project)
    const eveProjectRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: eveSession.cookie,
        "x-csrf-token": eveSession.csrf,
      },
      payload: { title: "Eve Private Project" },
    });
    const eveProject = eveProjectRes.json();
    const eveFolderRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${eveProject.id}/nodes`,
      headers: {
        origin,
        cookie: eveSession.cookie,
        "x-csrf-token": eveSession.csrf,
      },
      payload: { name: "eve_folder", kind: "FOLDER", parentId: null },
    });
    const eveFolder = eveFolderRes.json();

    const foreignParentRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        name: "stolen.tex",
        kind: "FILE",
        parentId: eveFolder.id,
      },
    });
    expect([400, 404]).toContain(foreignParentRes.statusCode);

    // 5e. Stale If-Match lock (treeVersion is 3, client supplies If-Match: "1") -> 412
    const staleLockRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${ch1File.id}/move`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
        "if-match": '"1"',
      },
      payload: {
        targetParentId: null,
      },
    });
    expect(staleLockRes.statusCode).toBe(412);

    // Verify tree version is still 3 after all failed operations
    const checkTreeRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(checkTreeRes.json().treeVersion).toBe(3);

    // 6. VALID MOVE: Move ch1.tex from 'chapters' to root with valid If-Match
    const validMoveRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${ch1File.id}/move`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
        "if-match": '"3"',
      },
      payload: {
        targetParentId: null,
      },
    });
    expect(validMoveRes.statusCode).toBe(200);
    const movedNode = validMoveRes.json();
    expect(movedNode.parentId).toBeNull();
    expect(movedNode.treeVersion).toBe(4);

    // 7. VALID RENAME: Rename ch1.tex to chapter_one.tex with valid If-Match
    const validRenameRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/nodes/${ch1File.id}/rename`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
        "if-match": '"4"',
      },
      payload: {
        name: "chapter_one.tex",
      },
    });
    expect(validRenameRes.statusCode).toBe(200);
    const renamedNode = validRenameRes.json();
    expect(renamedNode.name).toBe("chapter_one.tex");
    expect(renamedNode.treeVersion).toBe(5);

    // 8. RELOAD PERSISTENCE: GET /nodes returns full updated hierarchy
    const reloadedTreeRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(reloadedTreeRes.statusCode).toBe(200);
    const reloadedTree = reloadedTreeRes.json();
    expect(reloadedTree.treeVersion).toBe(5);

    const itemNames = reloadedTree.items.map((i: { name: string }) => i.name).sort();
    expect(itemNames).toEqual(["chapter_one.tex", "chapters", "figures", "main.tex"]);

    const chapterOneInTree = reloadedTree.items.find(
      (i: { name: string }) => i.name === "chapter_one.tex",
    );
    expect(chapterOneInTree.parentId).toBeNull();

    // 9. STRUCTURAL REVISION MANIFEST CHECKPOINT (S03-T07 verification)
    const revision = await revisionsRepo.createStructuralRevision({
      projectId: project.id,
      source: "MANUAL",
      authorId: alice.id,
      label: "Journey checkpoint",
    });
    expect(revision.revisionNo).toBe(6);
    expect(revision.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(revision.manifest.items).toHaveLength(2);
    expect(revision.manifest.items.map((i) => i.path).sort()).toEqual([
      "chapter_one.tex",
      "main.tex",
    ]);

    // 10. TENANT AND CROSS-PROJECT ISOLATION
    // Eve cannot read Alice's project
    const eveGetProj = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}`,
      headers: { origin, cookie: eveSession.cookie },
    });
    expect([403, 404]).toContain(eveGetProj.statusCode);

    // Eve cannot read Alice's tree
    const eveGetTree = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: eveSession.cookie },
    });
    expect([403, 404]).toContain(eveGetTree.statusCode);

    // Eve cannot mutate Alice's nodes
    const eveMutateNode = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: eveSession.cookie,
        "x-csrf-token": eveSession.csrf,
      },
      payload: { name: "hacked.tex", kind: "FILE", parentId: null },
    });
    expect([403, 404]).toContain(eveMutateNode.statusCode);

    // 11. NODE DELETION & CASCADING SUBTREE SOFT-DELETE
    // Create subfolder with file to verify recursive cascade
    const subfolderRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: { name: "to_delete_dir", kind: "FOLDER", parentId: null },
    });
    const subfolder = subfolderRes.json();

    const nestedFileRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: { name: "nested_to_delete.tex", kind: "FILE", parentId: subfolder.id },
    });
    const nestedFile = nestedFileRes.json();

    // Delete subfolder
    const deleteSubfolderRes = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/nodes/${subfolder.id}`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
    });
    expect(deleteSubfolderRes.statusCode).toBe(204);

    // Reload tree and ensure neither subfolder nor nested file appear
    const postDeleteTreeRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    const remainingIds = postDeleteTreeRes.json().items.map((i: { id: string }) => i.id);
    expect(remainingIds).not.toContain(subfolder.id);
    expect(remainingIds).not.toContain(nestedFile.id);

    // 12. PROJECT DELETION
    const deleteProjRes = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}`,
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
    });
    expect(deleteProjRes.statusCode).toBe(204);

    // Project is now soft-deleted: GET returns 404
    const getDeletedProj = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(getDeletedProj.statusCode).toBe(404);

    // Project does not appear in owned list
    const ownedProjectsRes = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/projects?filter=owned",
      headers: { origin, cookie: aliceSession.cookie },
    });
    const ownedIds = ownedProjectsRes.json().items.map((p: { id: string }) => p.id);
    expect(ownedIds).not.toContain(project.id);
  });
});
