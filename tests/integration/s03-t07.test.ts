import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("S03-T07 Structural revision manifests integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let revisionsRepo: RevisionsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    revisionsRepo = new RevisionsRepository(fixture.db);
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

  it("creates an immutable structural revision manifest pinning canonical paths and hashes", async () => {
    const session = await getSession();

    // 1. Create a project
    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `Manifest Test ${randomUUID()}` },
    });
    const project = projRes.json();

    // 2. Create folder "chapters" and file "intro.tex" inside it
    const folderRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "chapters", parentId: null, kind: "FOLDER" },
    });
    const folder = folderRes.json();

    const fileRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "intro.tex", parentId: folder.id, kind: "FILE" },
    });
    expect(fileRes.statusCode).toBe(201);

    // 3. Freeze structural revision
    const rev = await revisionsRepo.createStructuralRevision({
      projectId: project.id,
      authorId: owner.id,
      source: "checkpoint",
      label: "Release v1.0",
    });

    expect(rev.revisionNo).toBeGreaterThan(0);
    expect(rev.projectId).toBe(project.id);
    expect(rev.authorId).toBe(owner.id);
    expect(rev.source).toBe("checkpoint");
    expect(rev.label).toBe("Release v1.0");
    expect(rev.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rev.manifestKey).toBe(`projects/${project.id}/revisions/${rev.revisionNo}.json`);

    // Verify manifest contents
    expect(rev.manifest.version).toBe(1);
    expect(rev.manifest.revisionNo).toBe(rev.revisionNo);
    expect(rev.manifest.mainFileId).toBe(project.mainFileId);
    expect(rev.manifest.compiler).toBe("pdflatex");

    // Items include main.tex and chapters/intro.tex
    const paths = rev.manifest.items.map((i) => i.path);
    expect(paths).toContain("main.tex");
    expect(paths).toContain("chapters/intro.tex");

    // Verify items are sorted deterministically
    const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sortedPaths);

    // 4. Retrieve revision via getRevision
    const fetched = await revisionsRepo.getRevision(project.id, rev.revisionNo);
    expect(fetched).not.toBeNull();
    expect(fetched!.manifestHash).toBe(rev.manifestHash);
    expect(fetched!.items).toHaveLength(2);

    // 5. Create a second revision after adding a file
    await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "references.bib", parentId: null, kind: "FILE" },
    });

    const rev2 = await revisionsRepo.createStructuralRevision({
      projectId: project.id,
      authorId: owner.id,
      source: "checkpoint",
      label: "Added bib",
    });

    expect(rev2.revisionNo).toBe(rev.revisionNo + 2); // 1 for node create, 1 for revision
    expect(rev2.manifestHash).not.toBe(rev.manifestHash);

    // Prior revision in DB remains unchanged
    const prevFetched = await revisionsRepo.getRevision(project.id, rev.revisionNo);
    expect(prevFetched!.manifestHash).toBe(rev.manifestHash);
  });
});
