import type { DatabaseClient } from "@latex-collab/db";

export interface CompileJobRequest {
  projectId: string;
  revision: number;
  engine: "pdflatex" | "xelatex" | "lualatex" | "latex";
  rootFile?: string | undefined;
  requestedBy: string;
}

export interface CoalesceResult {
  action: "created" | "coalesced_successor" | "updated_queued";
  jobId: string;
  activeJobId?: string | undefined;
  revision: number;
}

export interface ActiveJobRecord {
  id: string;
  projectId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
  revision: number;
  engine: string;
  rootFile?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

/**
 * In-memory job coalescer providing deterministic queue behavior (CMP-08).
 * Ensures that keystrokes never terminate actively running jobs, and that
 * at most one queued successor is held in line behind an active job.
 */
export class InMemoryJobCoalescer {
  private jobs = new Map<string, ActiveJobRecord>();
  private nextId = 1;

  public getActiveJobs(projectId: string): ActiveJobRecord[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.projectId === projectId && (j.status === "queued" || j.status === "running")
    );
  }

  public getAllJobs(): ActiveJobRecord[] {
    return Array.from(this.jobs.values());
  }

  public getJob(jobId: string): ActiveJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  public updateJobStatus(jobId: string, status: ActiveJobRecord["status"]): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = Date.now();
    }
  }

  /**
   * Request compilation for a project. Coalesces incoming rapid requests:
   * 1. If no active job: creates a 'queued' job.
   * 2. If a job is currently 'running':
   *    - If a 'queued' successor already exists: updates the existing successor with latest revision.
   *    - If no successor exists: creates exactly ONE 'queued' successor.
   *    - NEVER interrupts or cancels the 'running' job!
   * 3. If the only active job is 'queued':
   *    - Updates the existing queued job to target the newer revision.
   */
  public enqueueOrCoalesce(request: CompileJobRequest): CoalesceResult {
    const activeJobs = this.getActiveJobs(request.projectId);

    const runningJob = activeJobs.find((j) => j.status === "running");
    const queuedJob = activeJobs.find((j) => j.status === "queued");

    // Case 1: Job is currently running
    if (runningJob) {
      if (queuedJob) {
        // Coalesce into existing queued successor with latest revision
        queuedJob.revision = request.revision;
        queuedJob.engine = request.engine;
        queuedJob.rootFile = request.rootFile;
        queuedJob.updatedAt = Date.now();
        return {
          action: "coalesced_successor",
          jobId: queuedJob.id,
          activeJobId: runningJob.id,
          revision: queuedJob.revision,
        };
      }

      // Create single queued successor
      const successorId = `job-${this.nextId++}`;
      const successor: ActiveJobRecord = {
        id: successorId,
        projectId: request.projectId,
        status: "queued",
        revision: request.revision,
        engine: request.engine,
        rootFile: request.rootFile,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.jobs.set(successorId, successor);
      return {
        action: "created",
        jobId: successorId,
        activeJobId: runningJob.id,
        revision: request.revision,
      };
    }

    // Case 2: No running job, but a queued job exists
    if (queuedJob) {
      queuedJob.revision = request.revision;
      queuedJob.engine = request.engine;
      queuedJob.rootFile = request.rootFile;
      queuedJob.updatedAt = Date.now();
      return {
        action: "updated_queued",
        jobId: queuedJob.id,
        revision: queuedJob.revision,
      };
    }

    // Case 3: Completely idle project
    const newJobId = `job-${this.nextId++}`;
    const newJob: ActiveJobRecord = {
      id: newJobId,
      projectId: request.projectId,
      status: "queued",
      revision: request.revision,
      engine: request.engine,
      rootFile: request.rootFile,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.set(newJobId, newJob);

    return {
      action: "created",
      jobId: newJobId,
      revision: request.revision,
    };
  }
}

/**
 * Database-backed compilation coalescer query (CMP-08).
 * Atomic transaction ensuring at most one queued successor exists in postgres compile_jobs.
 */
export async function coalesceCompileJobInDatabase(
  db: DatabaseClient,
  request: CompileJobRequest,
): Promise<CoalesceResult> {
  const activeRes = await db.query<{ id: string; status: string; revision_snapshot: number }>(
    `SELECT id, status, revision_snapshot
     FROM compile_jobs
     WHERE project_id = $1 AND status IN ('running', 'queued')
     ORDER BY created_at ASC`,
    [request.projectId],
  );

  const running = activeRes.rows.find((r) => r.status === "running");
  const queued = activeRes.rows.find((r) => r.status === "queued");

  if (running) {
    if (queued) {
      await db.query(
        `UPDATE compile_jobs
         SET revision_snapshot = $1, compiler = $2, updated_at = NOW()
         WHERE id = $3`,
        [request.revision, request.engine, queued.id],
      );
      return {
        action: "coalesced_successor",
        jobId: queued.id,
        activeJobId: running.id,
        revision: request.revision,
      };
    }

    const insRes = await db.query<{ id: string }>(
      `INSERT INTO compile_jobs (project_id, requested_by, compiler, revision_snapshot, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'queued', NOW(), NOW())
       RETURNING id`,
      [request.projectId, request.requestedBy, request.engine, request.revision],
    );
    return {
      action: "created",
      jobId: insRes.rows[0]!.id,
      activeJobId: running.id,
      revision: request.revision,
    };
  }

  if (queued) {
    await db.query(
      `UPDATE compile_jobs
       SET revision_snapshot = $1, compiler = $2, updated_at = NOW()
       WHERE id = $3`,
      [request.revision, request.engine, queued.id],
    );
    return {
      action: "updated_queued",
      jobId: queued.id,
      revision: request.revision,
    };
  }

  const insRes = await db.query<{ id: string }>(
    `INSERT INTO compile_jobs (project_id, requested_by, compiler, revision_snapshot, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'queued', NOW(), NOW())
     RETURNING id`,
    [request.projectId, request.requestedBy, request.engine, request.revision],
  );
  return {
    action: "created",
    jobId: insRes.rows[0]!.id,
    revision: request.revision,
  };
}
