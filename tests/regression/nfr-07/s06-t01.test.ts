import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { applyCompileMigrations } from "../../helpers/compile-migrations.js";
import { CompilationsRepository, CompileQuotaError } from "@latex-collab/db";

describe("NFR-07 Concurrent jobs remain within configured quotas (S06-T01)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user1: { id: string; email: string };
  let user2: { id: string; email: string };
  let projectId: string;
  let sourceRevisionId: string;
  let repo: CompilationsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);
    repo = new CompilationsRepository(fixture.db);

    user1 = await fixture.seed();
    user2 = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (id, title, owner_id, compiler, status, current_revision, created_at, updated_at)
       VALUES ($1, 'NFR-07 Quota Project', $2, 'pdflatex', 'active', 0, now(), now())
       RETURNING id`,
      [randomUUID(), user1.id],
    );
    projectId = projRes.rows[0]!.id;

    const revRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_revisions (id, project_id, revision_no, manifest_key, manifest_hash, source, created_at)
       VALUES ($1, $2, 0, 'manifests/root.json', 'sha256-abc', 'init', now())
       RETURNING id`,
      [randomUUID(), projectId],
    );
    sourceRevisionId = revRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("permits exactly 1 active compile per project by default", async () => {
    const key1 = `nfr07-key-user1-${randomUUID()}`;
    const key2 = `nfr07-key-user2-${randomUUID()}`;

    // User 1 queues a compile -> success
    const { job: job1 } = await repo.createJob({
      projectId,
      requestedBy: user1.id,
      idempotencyKey: key1,
      compiler: "pdflatex",
      sourceRevisionId,
      maxActivePerProject: 1,
      maxActivePerUser: 1,
    });
    expect(job1.status).toBe("queued");

    // User 2 attempts to queue a compile on the same project -> quota exceeded
    await expect(
      repo.createJob({
        projectId,
        requestedBy: user2.id,
        idempotencyKey: key2,
        compiler: "pdflatex",
        sourceRevisionId,
        maxActivePerProject: 1,
        maxActivePerUser: 1,
      }),
    ).rejects.toThrow(CompileQuotaError);

    // Complete Job 1
    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job1.id],
    );

    // Now User 2 can queue compile
    const { job: job2 } = await repo.createJob({
      projectId,
      requestedBy: user2.id,
      idempotencyKey: key2,
      compiler: "pdflatex",
      sourceRevisionId,
      maxActivePerProject: 1,
      maxActivePerUser: 1,
    });
    expect(job2.status).toBe("queued");

    // Clean up
    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job2.id],
    );
  });

  it("permits exactly 1 active compile per user across projects", async () => {
    // Create second project for User 1
    const proj2Res = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (id, title, owner_id, compiler, status, current_revision, created_at, updated_at)
       VALUES ($1, 'NFR-07 Second Project', $2, 'pdflatex', 'active', 0, now(), now())
       RETURNING id`,
      [randomUUID(), user1.id],
    );
    const projectId2 = proj2Res.rows[0]!.id;

    const rev2Res = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_revisions (id, project_id, revision_no, manifest_key, manifest_hash, source, created_at)
       VALUES ($1, $2, 0, 'manifests/root.json', 'sha256-xyz', 'init', now())
       RETURNING id`,
      [randomUUID(), projectId2],
    );
    const sourceRevisionId2 = rev2Res.rows[0]!.id;

    const key1 = `nfr07-p1-${randomUUID()}`;
    const key2 = `nfr07-p2-${randomUUID()}`;

    // User 1 queues in Project 1
    const { job: job1 } = await repo.createJob({
      projectId,
      requestedBy: user1.id,
      idempotencyKey: key1,
      compiler: "pdflatex",
      sourceRevisionId,
      maxActivePerProject: 1,
      maxActivePerUser: 1,
    });
    expect(job1.status).toBe("queued");

    // User 1 tries to queue in Project 2 -> user quota exceeded
    await expect(
      repo.createJob({
        projectId: projectId2,
        requestedBy: user1.id,
        idempotencyKey: key2,
        compiler: "pdflatex",
        sourceRevisionId: sourceRevisionId2,
        maxActivePerProject: 1,
        maxActivePerUser: 1,
      }),
    ).rejects.toThrow(CompileQuotaError);

    // Clean up
    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job1.id],
    );
  });
});
