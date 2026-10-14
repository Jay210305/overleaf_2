import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyCompileMigrations } from "../helpers/compile-migrations.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("S06-T02 Freeze compilation source revision integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let projectId: string;
  let session: { cookie: string; csrf: string };
  let revisionsRepo: RevisionsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);
    revisionsRepo = new RevisionsRepository(fixture.db);

    user = await fixture.seed();
    const loginRes = await fixture.login(user.email);
    session = {
      cookie: String(loginRes.headers["set-cookie"]).split(";")[0]!,
      csrf: String(loginRes.headers["x-csrf-token"]),
    };

    // Create project
    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        title: `S06-T02 Revision Freeze ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    expect(projRes.statusCode).toBe(201);
    projectId = projRes.json().id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("freezes active project tree into an immutable structural revision on compile enqueue", async () => {
    const key = `idemp-freeze-1-${randomUUID()}`;

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: { compiler: "pdflatex" },
    });

    expect(res.statusCode).toBe(202);
    const job = res.json();
    expect(job.sourceRevisionId).toBeDefined();

    // Verify revision exists in database and has manifest
    const revRes = await fixture.db.query<{ id: string; revision_no: number; manifest_hash: string }>(
      `SELECT id, revision_no, manifest_hash FROM project_revisions WHERE id = $1`,
      [job.sourceRevisionId],
    );
    expect(revRes.rows.length).toBe(1);
    const revRow = revRes.rows[0]!;
    expect(revRow.manifest_hash).toBeDefined();

    const loadedRevision = await revisionsRepo.getRevision(projectId, Number(revRow.revision_no));
    expect(loadedRevision).not.toBeNull();
    expect(loadedRevision?.manifest.projectId).toBe(projectId);

    // Clean up active job
    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job.id],
    );
  });

  it("ensures subsequent project edits do NOT alter the frozen revision input", async () => {
    const key1 = `idemp-freeze-2-${randomUUID()}`;

    // 1. Enqueue compile -> freezes revision A
    const res1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key1,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(res1.statusCode).toBe(202);
    const job1 = res1.json();

    const revARes = await fixture.db.query<{ revision_no: number; manifest_hash: string }>(
      `SELECT revision_no, manifest_hash FROM project_revisions WHERE id = $1`,
      [job1.sourceRevisionId],
    );
    const initialRevisionNo = Number(revARes.rows[0]!.revision_no);
    const initialManifestHash = revARes.rows[0]!.manifest_hash;

    // Complete job 1
    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job1.id],
    );

    // 2. Perform an edit on project tree by adding chapter1.tex node
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, name, kind, mime, size_bytes, content_kind)
       VALUES ($1, $2, 'chapter1.tex', 'FILE', 'text/x-tex', 50, 'TEXT')`,
      [randomUUID(), projectId],
    );

    // 3. Verify that the frozen revision A has NOT changed
    const revAAfter = await revisionsRepo.getRevision(projectId, initialRevisionNo);
    expect(revAAfter).not.toBeNull();
    expect(revAAfter?.manifestHash).toBe(initialManifestHash);

    // 4. Enqueue new compile -> creates revision B with different manifest hash
    const key2 = `idemp-freeze-3-${randomUUID()}`;
    const res2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key2,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(res2.statusCode).toBe(202);
    const job2 = res2.json();

    expect(job2.sourceRevisionId).not.toBe(job1.sourceRevisionId);

    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job2.id],
    );
  });

  it("binds explicitly specified targetRevisionId if valid", async () => {
    // Get existing revision from earlier test
    const revRes = await fixture.db.query<{ id: string }>(
      `SELECT id FROM project_revisions WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    const targetRevId = revRes.rows[0]!.id;

    const key = `idemp-target-rev-${randomUUID()}`;
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: {
        compiler: "pdflatex",
        targetRevisionId: targetRevId,
      },
    });

    expect(res.statusCode).toBe(202);
    const job = res.json();
    expect(job.sourceRevisionId).toBe(targetRevId);

    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job.id],
    );
  });

  it("rejects non-existent targetRevisionId with 404 RESOURCE_NOT_FOUND", async () => {
    const bogusRevId = randomUUID();
    const key = `idemp-bogus-rev-${randomUUID()}`;

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: {
        compiler: "pdflatex",
        targetRevisionId: bogusRevId,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RESOURCE_NOT_FOUND");
  });
});
