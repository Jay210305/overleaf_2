import { createHash, randomUUID } from "node:crypto";
import type { Compiler, CompileStatus, Diagnostic, CompilationView } from "@latex-collab/contracts";
import {
  assertUUID,
  type DatabaseClient,
  mapDatabaseError,
  PersistenceError,
  type TransactionContext,
} from "../client.js";
import { RevisionsRepository, type StructuralRevisionRecord } from "./revisions.js";

export type CompileJobRow = {
  id: string;
  project_id: string;
  requested_by: string;
  source_revision_id: string;
  target_revision_id: string | null;
  engine: Compiler;
  options_hash: string;
  status: CompileStatus;
  queue_id: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  error_code: string | null;
  artifact_set_id: string | null;
  idempotency_key_hash: string | null;
  force_clean: boolean;
  diagnostics: Diagnostic[];
  pdf_available: boolean;
  lease_expires_at: Date | null;
  attempts: number;
  created_at: Date;
  updated_at: Date;
};

export type CreateJobInput = {
  projectId: string;
  requestedBy: string;
  idempotencyKey: string;
  compiler: Compiler;
  sourceRevisionId: string;
  targetRevisionId?: string | null | undefined;
  forceClean?: boolean | undefined;
  maxActivePerProject?: number | undefined;
  maxActivePerUser?: number | undefined;
};

export type ListJobsOptions = {
  limit?: number | undefined;
  cursor?: string | null | undefined;
};

export type ClaimJobOptions = {
  now?: Date | undefined;
  leaseMs?: number | undefined;
};

export type CompleteJobInput = {
  status: CompileStatus;
  errorCode?: string | null | undefined;
  diagnostics?: Diagnostic[] | undefined;
  pdfAvailable?: boolean | undefined;
  artifactSetId?: string | null | undefined;
};

export class CompileQuotaError extends Error {
  readonly code = "QUOTA_EXCEEDED" as const;
  readonly status = 429 as const;

  constructor(
    message = "Concurrent compile quota exceeded (at most one active compile per user/project)",
  ) {
    super(message);
    this.name = "CompileQuotaError";
  }
}

export function toCompilationView(row: CompileJobRow): CompilationView {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceRevisionId: row.source_revision_id,
    status: row.status,
    startedAt: row.started_at ? row.started_at.toISOString() : null,
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    pdfAvailable: Boolean(row.pdf_available),
    diagnostics: Array.isArray(row.diagnostics) ? row.diagnostics : [],
  };
}

function checkIdempotencyKey(key: string): string {
  if (typeof key !== "string" || key.length < 16 || key.length > 128) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid idempotency key", false);
  }
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function computeOptionsHash(compiler: Compiler, forceClean: boolean): string {
  return createHash("sha256")
    .update(JSON.stringify({ compiler, forceClean: Boolean(forceClean) }), "utf8")
    .digest("hex");
}

function sameJobFingerprint(row: CompileJobRow, input: CreateJobInput): boolean {
  const sameEngine = row.engine === input.compiler;
  const sameForceClean = Boolean(row.force_clean) === Boolean(input.forceClean);
  const sameTarget = input.targetRevisionId
    ? row.target_revision_id === input.targetRevisionId
    : true;
  return sameEngine && sameForceClean && sameTarget;
}

export class CompilationsRepository {
  constructor(private readonly client: DatabaseClient) {}

  /**
   * Idempotently enqueues a compile job bound to an immutable source revision.
   * Enforces concurrent compilation quotas per user and per project (CMP-04, NFR-07).
   */
  async createJob(
    input: CreateJobInput,
    txContext?: TransactionContext,
  ): Promise<{ job: CompilationView; created: boolean; raw: CompileJobRow }> {
    assertUUID(input.projectId, "projectId");
    assertUUID(input.requestedBy, "requestedBy");
    assertUUID(input.sourceRevisionId, "sourceRevisionId");
    if (input.targetRevisionId) {
      assertUUID(input.targetRevisionId, "targetRevisionId");
    }

    const validEngines: Compiler[] = ["pdflatex", "xelatex", "lualatex", "latex"];
    if (!validEngines.includes(input.compiler)) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid compiler engine", false);
    }

    const keyHash = checkIdempotencyKey(input.idempotencyKey);
    const optionsHash = computeOptionsHash(input.compiler, Boolean(input.forceClean));
    const maxPerProject = input.maxActivePerProject ?? 1;
    const maxPerUser = input.maxActivePerUser ?? 1;

    const run = async (
      tx: TransactionContext,
    ): Promise<{ job: CompilationView; created: boolean; raw: CompileJobRow }> => {
      // 1. Check if same idempotency key was already used by this actor for this project
      const existingRes = await tx.query<CompileJobRow>(
        `SELECT * FROM compile_jobs
         WHERE requested_by = $1 AND project_id = $2 AND idempotency_key_hash = $3`,
        [input.requestedBy, input.projectId, keyHash],
      );
      const existing = existingRes.rows[0];
      if (existing) {
        if (!sameJobFingerprint(existing, input)) {
          throw new PersistenceError(
            "CONSTRAINT_VIOLATION",
            "Idempotency key reused with different compilation input",
            false,
          );
        }
        return { job: toCompilationView(existing), created: false, raw: existing };
      }

      // 2. Lock and check active compile quota for this user and project (NFR-07, CMP-04)
      const countRes = await tx.query<{ project_active: string; user_active: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE project_id = $1) AS project_active,
           COUNT(*) FILTER (WHERE requested_by = $2) AS user_active
         FROM compile_jobs
         WHERE (project_id = $1 OR requested_by = $2)
           AND status IN ('queued', 'running', 'cancel_requested')`,
        [input.projectId, input.requestedBy],
      );

      const projectActive = Number(countRes.rows[0]?.project_active ?? 0);
      const userActive = Number(countRes.rows[0]?.user_active ?? 0);

      if (projectActive >= maxPerProject || userActive >= maxPerUser) {
        throw new CompileQuotaError();
      }

      // 3. Insert new queued compile job
      const jobId = randomUUID();
      try {
        const insertRes = await tx.query<CompileJobRow>(
          `INSERT INTO compile_jobs (
             id, project_id, requested_by, idempotency_key_hash, source_revision_id,
             target_revision_id, engine, options_hash, status, force_clean,
             diagnostics, pdf_available, attempts, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, '[]'::jsonb, false, 0, now(), now())
           RETURNING *`,
          [
            jobId,
            input.projectId,
            input.requestedBy,
            keyHash,
            input.sourceRevisionId,
            input.targetRevisionId ?? null,
            input.compiler,
            optionsHash,
            Boolean(input.forceClean),
          ],
        );
        const row = insertRes.rows[0]!;
        return { job: toCompilationView(row), created: true, raw: row };
      } catch (err: unknown) {
        const mapped = mapDatabaseError(err);
        if (mapped.code === "TRANSACTION_CONFLICT" || (err as { code?: string }).code === "23505") {
          // Unique index race: re-read the existing job and check fingerprint
          const raced = await tx.query<CompileJobRow>(
            `SELECT * FROM compile_jobs
             WHERE requested_by = $1 AND project_id = $2 AND idempotency_key_hash = $3`,
            [input.requestedBy, input.projectId, keyHash],
          );
          if (raced.rows[0]) {
            if (!sameJobFingerprint(raced.rows[0], input)) {
              throw new PersistenceError(
                "CONSTRAINT_VIOLATION",
                "Idempotency key reused with different compilation input",
                false,
              );
            }
            return {
              job: toCompilationView(raced.rows[0]),
              created: false,
              raw: raced.rows[0],
            };
          }
        }
        throw mapped;
      }
    };

    if (txContext) {
      return run(txContext);
    }
    return this.client.transaction(run);
  }

  /**
   * Retrieves a job by ID, optionally scoped to a project.
   */
  async getJob(jobId: string, projectId?: string): Promise<CompilationView | null> {
    assertUUID(jobId, "jobId");
    if (projectId) assertUUID(projectId, "projectId");

    const query = projectId
      ? `SELECT * FROM compile_jobs WHERE id = $1 AND project_id = $2`
      : `SELECT * FROM compile_jobs WHERE id = $1`;
    const params = projectId ? [jobId, projectId] : [jobId];

    const res = await this.client.query<CompileJobRow>(query, params);
    const row = res.rows[0];
    return row ? toCompilationView(row) : null;
  }

  /**
   * Retrieves the raw job row by ID.
   */
  async getRawJob(jobId: string, projectId?: string): Promise<CompileJobRow | null> {
    assertUUID(jobId, "jobId");
    if (projectId) assertUUID(projectId, "projectId");

    const query = projectId
      ? `SELECT * FROM compile_jobs WHERE id = $1 AND project_id = $2`
      : `SELECT * FROM compile_jobs WHERE id = $1`;
    const params = projectId ? [jobId, projectId] : [jobId];

    const res = await this.client.query<CompileJobRow>(query, params);
    return res.rows[0] ?? null;
  }

  /**
   * Lists compile jobs for a project with deterministic cursor pagination.
   */
  async listJobs(
    projectId: string,
    options: ListJobsOptions = {},
  ): Promise<{ items: CompilationView[]; nextCursor: string | null }> {
    assertUUID(projectId, "projectId");
    const limit = Math.min(Math.max(1, options.limit ?? 20), 100);

    let whereClause = `WHERE project_id = $1`;
    const params: (string | number | Date)[] = [projectId, limit + 1];

    if (options.cursor) {
      try {
        const decoded = Buffer.from(options.cursor, "base64url").toString("utf8");
        const [timeStr, cursorId] = decoded.split("#");
        if (timeStr && cursorId) {
          const cursorTime = new Date(timeStr);
          if (Number.isFinite(cursorTime.getTime())) {
            params.push(cursorTime, cursorId);
            whereClause += ` AND (created_at < $3 OR (created_at = $3 AND id < $4))`;
          }
        }
      } catch {
        // Fall back to beginning if invalid cursor
      }
    }

    const sql = `
      SELECT * FROM compile_jobs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `;

    const res = await this.client.query<CompileJobRow>(sql, params);
    const hasMore = res.rows.length > limit;
    const rows = hasMore ? res.rows.slice(0, limit) : res.rows;

    let nextCursor: string | null = null;
    if (hasMore && rows.length > 0) {
      const last = rows[rows.length - 1]!;
      nextCursor = Buffer.from(`${last.created_at.toISOString()}#${last.id}`, "utf8").toString(
        "base64url",
      );
    }

    return {
      items: rows.map(toCompilationView),
      nextCursor,
    };
  }

  /**
   * Cancels a compile job:
   * - queued -> cancelled
   * - running -> cancel_requested
   * - cancel_requested / succeeded / failed / timed_out / cancelled -> unchanged
   */
  async cancelJob(jobId: string, projectId: string): Promise<CompilationView | null> {
    assertUUID(jobId, "jobId");
    assertUUID(projectId, "projectId");

    return this.client.transaction(async (tx) => {
      const found = await tx.query<CompileJobRow>(
        `SELECT * FROM compile_jobs WHERE id = $1 AND project_id = $2 FOR UPDATE`,
        [jobId, projectId],
      );
      const row = found.rows[0];
      if (!row) return null;

      if (row.status === "queued") {
        const updated = await tx.query<CompileJobRow>(
          `UPDATE compile_jobs
           SET status = 'cancelled', finished_at = now(), updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [jobId],
        );
        return toCompilationView(updated.rows[0]!);
      }

      if (row.status === "running") {
        const updated = await tx.query<CompileJobRow>(
          `UPDATE compile_jobs
           SET status = 'cancel_requested', updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [jobId],
        );
        return toCompilationView(updated.rows[0]!);
      }

      return toCompilationView(row);
    });
  }

  /**
   * Atomically claims the next pending compile job for the worker using row-level locking.
   */
  async claimNext(options: ClaimJobOptions = {}): Promise<CompileJobRow | null> {
    const now = options.now ?? new Date();
    const leaseMs = options.leaseMs ?? 5 * 60_000;
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);

    return this.client.transaction(async (tx) => {
      const candidate = await tx.query<{ id: string }>(
        `SELECT id FROM compile_jobs
         WHERE (
           status = 'queued'
           OR (status = 'running' AND lease_expires_at < $1 AND attempts < 3)
         )
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [now],
      );

      const targetId = candidate.rows[0]?.id;
      if (!targetId) return null;

      const updated = await tx.query<CompileJobRow>(
        `UPDATE compile_jobs
         SET status = 'running',
             lease_expires_at = $1,
             attempts = attempts + 1,
             started_at = COALESCE(started_at, $2),
             updated_at = $2
         WHERE id = $3
         RETURNING *`,
        [leaseExpiresAt, now, targetId],
      );

      return updated.rows[0] ?? null;
    });
  }

  /**
   * Heartbeat to renew worker lease on an actively executing job.
   */
  async heartbeat(jobId: string, leaseMs: number, now: Date = new Date()): Promise<boolean> {
    assertUUID(jobId, "jobId");
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const res = await this.client.query(
      `UPDATE compile_jobs
       SET lease_expires_at = $1, updated_at = $2
       WHERE id = $3 AND status = 'running'`,
      [leaseExpiresAt, now, jobId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Completes a compile job with its terminal result and diagnostics.
   */
  async completeJob(jobId: string, result: CompleteJobInput): Promise<CompileJobRow | null> {
    assertUUID(jobId, "jobId");

    const res = await this.client.query<CompileJobRow>(
      `UPDATE compile_jobs
       SET status = $1,
           finished_at = now(),
           error_code = $2,
           diagnostics = $3::jsonb,
           pdf_available = $4,
           artifact_set_id = $5,
           lease_expires_at = NULL,
           updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [
        result.status,
        result.errorCode ?? null,
        JSON.stringify(result.diagnostics ?? []),
        Boolean(result.pdfAvailable),
        result.artifactSetId ?? null,
        jobId,
      ],
    );

    return res.rows[0] ?? null;
  }

  /**
   * Recovers stale jobs after worker crashes or queue restarts:
   * - Jobs running with expired lease beyond attempts -> timed_out
   * - Jobs in cancel_requested with expired lease -> cancelled
   */
  async recoverStaleJobs(options: { now?: Date; maxRunningMs?: number } = {}): Promise<number> {
    const now = options.now ?? new Date();
    let recoveredCount = 0;

    const timedOutRes = await this.client.query(
      `UPDATE compile_jobs
       SET status = 'timed_out',
           finished_at = $1,
           error_code = 'TIMEOUT',
           lease_expires_at = NULL,
           updated_at = $1
       WHERE status = 'running'
         AND lease_expires_at < $1
         AND attempts >= 3`,
      [now],
    );
    recoveredCount += timedOutRes.rowCount ?? 0;

    const cancelledRes = await this.client.query(
      `UPDATE compile_jobs
       SET status = 'cancelled',
           finished_at = $1,
           error_code = 'CANCELLED',
           lease_expires_at = NULL,
           updated_at = $1
       WHERE status = 'cancel_requested'
         AND lease_expires_at < $1`,
      [now],
    );
    recoveredCount += cancelledRes.rowCount ?? 0;

    return recoveredCount;
  }
}

export type FreezeRevisionParams = {
  db: DatabaseClient;
  projectId: string;
  authorId?: string | null | undefined;
  targetRevisionId?: string | null | undefined;
  source?: string | undefined;
  label?: string | null | undefined;
  txContext?: TransactionContext | undefined;
};

export type FreezeRevisionResult = {
  revision: StructuralRevisionRecord;
  frozenAt: Date;
  isExisting: boolean;
};

export class RevisionNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND" as const;
  readonly status = 404 as const;

  constructor(message = "Specified target revision not found for project") {
    super(message);
    this.name = "RevisionNotFoundError";
  }
}

/**
 * Freezes the compilation source revision before enqueuing a compile job (S06-T02, NFR-06, CMP-01).
 * If targetRevisionId is provided, validates that it exists and belongs to the project.
 * If targetRevisionId is not provided, captures current active tree into an immutable structural revision.
 * Invariant: Job binds immutable revision and manifest hash before enqueue; concurrent source changes do not change inputs.
 */
export async function freezeCompilationRevision(
  params: FreezeRevisionParams,
): Promise<FreezeRevisionResult> {
  assertUUID(params.projectId, "projectId");
  const revisionsRepo = new RevisionsRepository(params.db);
  const runner = params.txContext ?? params.db;

  if (params.targetRevisionId) {
    assertUUID(params.targetRevisionId, "targetRevisionId");
    const res = await runner.query<{ revision_no: number }>(
      `SELECT revision_no FROM project_revisions
       WHERE id = $1 AND project_id = $2`,
      [params.targetRevisionId, params.projectId],
    );
    const row = res.rows[0];
    if (!row) {
      throw new RevisionNotFoundError(
        `Target revision ${params.targetRevisionId} not found for project ${params.projectId}`,
      );
    }

    const revision = await revisionsRepo.getRevision(params.projectId, Number(row.revision_no));
    if (!revision) {
      throw new RevisionNotFoundError(
        `Target revision ${params.targetRevisionId} could not be loaded`,
      );
    }

    return {
      revision,
      frozenAt: new Date(revision.createdAt),
      isExisting: true,
    };
  }

  // Freeze active project tree into a new immutable structural revision
  const revision = await revisionsRepo.createStructuralRevision(
    {
      projectId: params.projectId,
      authorId: params.authorId ?? null,
      source: params.source ?? "compile",
      label: params.label ?? "Auto-compile snapshot",
    },
    params.txContext,
  );

  return {
    revision,
    frozenAt: new Date(revision.createdAt),
    isExisting: false,
  };
}
