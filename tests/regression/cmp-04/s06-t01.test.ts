import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyCompileMigrations } from "../../helpers/compile-migrations.js";
import { CompilationsRepository } from "@latex-collab/db";

describe("CMP-04 Durable queued/running/succeeded/failed/timed_out/cancelled jobs (S06-T01)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let projectId: string;
  let repo: CompilationsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);
    repo = new CompilationsRepository(fixture.db);

    user = await fixture.seed();
    const session = await fixture.login(user.email);

    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: String(session.headers["set-cookie"]).split(";")[0]!,
        "x-csrf-token": String(session.headers["x-csrf-token"]),
      },
      payload: {
        title: `CMP-04 Test ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    projectId = projRes.json().id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("persists all 7 contract lifecycle statuses in database", async () => {
    const statuses = [
      "queued",
      "running",
      "succeeded",
      "failed",
      "timed_out",
      "cancel_requested",
      "cancelled",
    ] as const;

    // Create a source revision to link
    const revRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_revisions (id, project_id, revision_no, manifest_key, manifest_hash, source, created_at)
       VALUES ($1, $2, 999, 'manifests/test.json', 'hash-123', 'test', now())
       RETURNING id`,
      [randomUUID(), projectId],
    );
    const sourceRevisionId = revRes.rows[0]!.id;

    for (const status of statuses) {
      const jobId = randomUUID();
      const keyHash = randomUUID().replace(/-/g, "");

      await fixture.db.query(
        `INSERT INTO compile_jobs (
           id, project_id, requested_by, source_revision_id, engine, options_hash,
           status, idempotency_key_hash, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, 'pdflatex', 'opt-hash', $5, $6, now(), now())`,
        [jobId, projectId, user.id, sourceRevisionId, status, keyHash],
      );

      const job = await repo.getJob(jobId, projectId);
      expect(job).not.toBeNull();
      expect(job?.status).toBe(status);
    }
  });

  it("enforces database check constraint: rejects invalid status", async () => {
    const revRes = await fixture.db.query<{ id: string }>(
      `SELECT id FROM project_revisions WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    const sourceRevisionId = revRes.rows[0]!.id;

    await expect(
      fixture.db.query(
        `INSERT INTO compile_jobs (
           id, project_id, requested_by, source_revision_id, engine, options_hash,
           status, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, 'pdflatex', 'opt-hash', 'bogus_status', now(), now())`,
        [randomUUID(), projectId, user.id, sourceRevisionId],
      ),
    ).rejects.toThrow();
  });

  it("enforces idempotency key uniqueness per user and project", async () => {
    const revRes = await fixture.db.query<{ id: string }>(
      `SELECT id FROM project_revisions WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    const sourceRevisionId = revRes.rows[0]!.id;
    const key = `fixed-idempotency-key-${randomUUID()}`;

    const { job: job1, created: created1 } = await repo.createJob({
      projectId,
      requestedBy: user.id,
      idempotencyKey: key,
      compiler: "pdflatex",
      sourceRevisionId,
      forceClean: false,
      maxActivePerProject: 10,
      maxActivePerUser: 10,
    });
    expect(created1).toBe(true);

    const { job: job2, created: created2 } = await repo.createJob({
      projectId,
      requestedBy: user.id,
      idempotencyKey: key,
      compiler: "pdflatex",
      sourceRevisionId,
      forceClean: false,
      maxActivePerProject: 10,
      maxActivePerUser: 10,
    });
    expect(created2).toBe(false);
    expect(job2.id).toBe(job1.id);
  });
});
