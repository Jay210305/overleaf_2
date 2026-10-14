import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../helpers/s02-session.js";
import { applyCompileMigrations } from "../helpers/compile-migrations.js";
import {
  assertValidStatusTransition,
  InvalidStatusTransitionError,
  reconcileExpiredLeases,
} from "../../apps/jobs/src/compilation/lifecycle.js";
import { CompilationsRepository } from "@latex-collab/db";

describe("S06-T14 Timeout cancellation and job recovery integration", () => {
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
       VALUES ($1, 'S06-T14 Lifecycle Project', $2, 'pdflatex', 'active', 0, now(), now())
       RETURNING id`,
      [randomUUID(), user.id],
    );
    projectId = projRes.rows[0]!.id;

    const revRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO project_revisions (id, project_id, revision_no, manifest_key, manifest_hash, source, created_at)
       VALUES ($1, $2, 0, 'manifests/root.json', 'sha256-lifecycle', 'init', now())
       RETURNING id`,
      [randomUUID(), projectId],
    );
    sourceRevisionId = revRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("enforces contract state machine transitions", () => {
    // Allowed transitions
    expect(() => assertValidStatusTransition("queued", "running")).not.toThrow();
    expect(() => assertValidStatusTransition("queued", "cancelled")).not.toThrow();
    expect(() => assertValidStatusTransition("running", "succeeded")).not.toThrow();
    expect(() => assertValidStatusTransition("running", "failed")).not.toThrow();
    expect(() => assertValidStatusTransition("running", "timed_out")).not.toThrow();
    expect(() => assertValidStatusTransition("running", "cancel_requested")).not.toThrow();
    expect(() => assertValidStatusTransition("cancel_requested", "cancelled")).not.toThrow();
    expect(() => assertValidStatusTransition("cancel_requested", "succeeded")).not.toThrow();

    // Forbidden transitions
    expect(() => assertValidStatusTransition("running", "cancelled")).toThrow(
      InvalidStatusTransitionError,
    );
    expect(() => assertValidStatusTransition("succeeded", "running")).toThrow(
      InvalidStatusTransitionError,
    );
    expect(() => assertValidStatusTransition("failed", "queued")).toThrow(
      InvalidStatusTransitionError,
    );
    expect(() => assertValidStatusTransition("timed_out", "running")).toThrow(
      InvalidStatusTransitionError,
    );
  });

  it("reconciles expired leases: marks dead worker jobs as timed_out preserving stable ID", async () => {
    const jobId = randomUUID();
    const past = new Date(Date.now() - 60_000);

    // Insert dead running job with 3 attempts and expired lease
    await fixture.db.query(
      `INSERT INTO compile_jobs (
         id, project_id, requested_by, source_revision_id, engine, options_hash,
         status, attempts, lease_expires_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'pdflatex', 'opt-hash', 'running', 3, $5, $5, $5)`,
      [jobId, projectId, user.id, sourceRevisionId, past],
    );

    const result = await reconcileExpiredLeases(fixture.db, { now: new Date() });
    expect(result.timedOut).toBeGreaterThanOrEqual(1);

    const reconciled = await repo.getJob(jobId, projectId);
    expect(reconciled?.id).toBe(jobId);
    expect(reconciled?.status).toBe("timed_out");
  });

  it("reconciles cancel_requested jobs whose lease expired to cancelled", async () => {
    const jobId = randomUUID();
    const past = new Date(Date.now() - 60_000);

    await fixture.db.query(
      `INSERT INTO compile_jobs (
         id, project_id, requested_by, source_revision_id, engine, options_hash,
         status, lease_expires_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'pdflatex', 'opt-hash', 'cancel_requested', $5, $5, $5)`,
      [jobId, projectId, user.id, sourceRevisionId, past],
    );

    const result = await reconcileExpiredLeases(fixture.db, { now: new Date() });
    expect(result.cancelled).toBeGreaterThanOrEqual(1);

    const reconciled = await repo.getJob(jobId, projectId);
    expect(reconciled?.id).toBe(jobId);
    expect(reconciled?.status).toBe("cancelled");
  });
});
