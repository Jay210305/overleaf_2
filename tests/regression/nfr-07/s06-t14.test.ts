import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { applyCompileMigrations } from "../../helpers/compile-migrations.js";
import { reconcileExpiredLeases } from "../../../apps/jobs/src/compilation/lifecycle.js";
import { CompilationsRepository } from "@latex-collab/db";

describe("NFR-07 Lease reconciliation frees active compile quota (S06-T14)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let projectId: string;
  let sourceRevisionId: string;
  let repo: CompilationsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);
    repo = new CompilationsRepository(fixture.db);

    user = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (id, title, owner_id, compiler, status, current_revision, created_at, updated_at)
       VALUES ($1, 'NFR-07 S06-T14 Project', $2, 'pdflatex', 'active', 0, now(), now())
       RETURNING id`,
      [randomUUID(), user.id],
    );
    projectId = projRes.rows[0]!.id;

    const revRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_revisions (id, project_id, revision_no, manifest_key, manifest_hash, source, created_at)
       VALUES ($1, $2, 0, 'manifests/root.json', 'sha256-nfr07-t14', 'init', now())
       RETURNING id`,
      [randomUUID(), projectId],
    );
    sourceRevisionId = revRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("reconciling expired running job frees quota so a new compile can be enqueued", async () => {
    const past = new Date(Date.now() - 60_000);

    // Create a dead running job occupying quota
    const deadJobId = randomUUID();
    await fixture.db.query(
      `INSERT INTO compile_jobs (
         id, project_id, requested_by, source_revision_id, engine, options_hash,
         status, attempts, lease_expires_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'pdflatex', 'opt-hash', 'running', 3, $5, $5, $5)`,
      [deadJobId, projectId, user.id, sourceRevisionId, past],
    );

    // Reconcile leases -> moves dead job to timed_out
    await reconcileExpiredLeases(fixture.db, { now: new Date() });

    // Now enqueuing a new compile succeeds
    const key = `nfr-07-after-recovery-${randomUUID()}`;
    const { job: newJob } = await repo.createJob({
      projectId,
      requestedBy: user.id,
      idempotencyKey: key,
      compiler: "pdflatex",
      sourceRevisionId,
      maxActivePerProject: 1,
      maxActivePerUser: 1,
    });

    expect(newJob.status).toBe("queued");

    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [newJob.id],
    );
  });
});
