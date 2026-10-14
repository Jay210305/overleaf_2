import type {
  Compiler,
  CompilerExecutor,
  ExecuteInput,
  ExecuteOutput,
  RevisionManifest,
} from "@latex-collab/contracts";
import type { StorageAdapter } from "@latex-collab/storage";
import {
  type DatabaseClient,
  type CompileJobRow,
  CompilationsRepository,
  RevisionsRepository,
} from "@latex-collab/db";
import { persistJobArtifacts, PdfValidationError } from "./artifacts.js";

export type CompilationPassOptions = {
  now?: Date;
  leaseMs?: number;
  maxAttempts?: number;
  limit?: number;
  executor?: CompilerExecutor;
  storage?: StorageAdapter;
};

export type CompilationPassResult = {
  claimed: number;
  completed: number;
  cancelled: number;
  failed: number;
  recovered: number;
};

/**
 * Worker component responsible for durable compile job lifecycle execution.
 * Claims pending jobs atomically, manages heartbeats, executes TeX workloads,
 * enforces cancellation boundaries, and recovers stale jobs after crashes (S06-T01, CMP-04, NFR-07).
 */
export class CompilationWorker {
  private readonly repo: CompilationsRepository;
  private readonly revisionsRepo: RevisionsRepository;

  constructor(
    private readonly db: DatabaseClient,
    private readonly executor?: CompilerExecutor,
    private readonly storage?: StorageAdapter,
  ) {
    this.repo = new CompilationsRepository(db);
    this.revisionsRepo = new RevisionsRepository(db);
  }

  /**
   * Recovers stale jobs whose lease expired after worker crash or queue restart.
   */
  async recoverStale(options: { now?: Date } = {}): Promise<number> {
    return this.repo.recoverStaleJobs(options);
  }

  /**
   * Claims and processes a single compile job.
   */
  async processNextJob(options: {
    now?: Date;
    leaseMs?: number;
    executor?: CompilerExecutor;
    storage?: StorageAdapter;
  } = {}): Promise<{ job: CompileJobRow | null; completed: boolean }> {
    const now = options.now ?? new Date();
    const leaseMs = options.leaseMs ?? 5 * 60_000;
    const activeExecutor = options.executor ?? this.executor;
    const activeStorage = options.storage ?? this.storage;

    // 1. Claim next pending job
    const job = await this.repo.claimNext({ now, leaseMs });
    if (!job) {
      return { job: null, completed: false };
    }

    // 2. Check if cancellation was requested before execution
    const freshJob = await this.repo.getRawJob(job.id);
    if (freshJob?.status === "cancel_requested") {
      await this.repo.completeJob(job.id, {
        status: "cancelled",
        errorCode: "CANCELLED",
        diagnostics: [],
        pdfAvailable: false,
      });
      return { job: { ...job, status: "cancelled" }, completed: true };
    }

    // 3. If no executor provided, keep as running (claimed)
    if (!activeExecutor) {
      return { job, completed: false };
    }

    // 4. Set up heartbeat and abort controller
    const abortController = new AbortController();
    const heartbeatInterval = setInterval(async () => {
      try {
        const stillActive = await this.repo.heartbeat(job.id, leaseMs);
        if (!stillActive) {
          abortController.abort();
        } else {
          const check = await this.repo.getRawJob(job.id);
          if (check?.status === "cancel_requested") {
            abortController.abort();
          }
        }
      } catch {
        // Ignore background heartbeat error
      }
    }, Math.min(10_000, Math.max(1_000, Math.floor(leaseMs / 3))));
    heartbeatInterval.unref?.();

    try {
      // 5. Load revision manifest for input binding
      const revRes = await this.db.query<{ revision_no: number }>(
        `SELECT revision_no FROM project_revisions WHERE id = $1`,
        [job.source_revision_id],
      );
      const revisionNo = revRes.rows[0]?.revision_no;
      const revision =
        revisionNo !== undefined
          ? await this.revisionsRepo.getRevision(job.project_id, Number(revisionNo))
          : null;

      const manifest: RevisionManifest = revision?.manifest
        ? {
            version: 1,
            projectId: revision.manifest.projectId,
            revisionId: revision.manifest.revisionId,
            revisionNo: revision.manifest.revisionNo,
            mainFileId: revision.manifest.mainFileId ?? "",
            compiler: (job.engine ?? "pdflatex") as Compiler,
            texliveImageDigest: revision.manifest.texliveImageDigest ?? "texlive:latest",
            items: revision.manifest.items.map((it) => ({
              nodeId: it.nodeId,
              path: it.path,
              kind: it.kind,
              object: it.object,
            })),
          }
        : {
            version: 1,
            projectId: job.project_id,
            revisionId: job.source_revision_id,
            revisionNo: 0,
            mainFileId: "",
            compiler: job.engine,
            texliveImageDigest: "texlive:latest",
            items: [],
          };

      const executeInput: ExecuteInput = {
        jobId: job.id,
        manifest,
        compiler: job.engine,
        imageDigest: "texlive:latest",
        policyVersion: "1.0.0",
        limits: {
          timeoutSeconds: 60,
          memoryMiB: 512,
          cpuCores: 1,
          maxOutputBytes: 25 * 1024 * 1024,
        },
      };

      const output: ExecuteOutput = await activeExecutor.execute(
        executeInput,
        abortController.signal,
      );

      let pdfAvailable = false;
      if (output.status === "succeeded") {
        if (activeStorage) {
          try {
            await persistJobArtifacts({
              db: this.db,
              storage: activeStorage,
              projectId: job.project_id,
              jobId: job.id,
              sourceHash: job.source_revision_id,
              artifacts: output.artifacts,
            });
            pdfAvailable = output.artifacts.some(
              (a) => a.name === "output.pdf" || a.name.endsWith(".pdf"),
            );
          } catch (artifactErr) {
            if (artifactErr instanceof PdfValidationError) {
              const completed = await this.repo.completeJob(job.id, {
                status: "failed",
                errorCode: "INVALID_PDF_ARTIFACT",
                diagnostics: [
                  {
                    severity: "error",
                    message: (artifactErr as Error).message,
                  },
                ],
                pdfAvailable: false,
              });
              return { job: completed ?? job, completed: true };
            }
            throw artifactErr;
          }
        } else {
          pdfAvailable = output.artifacts.some(
            (a) => a.name === "output.pdf" || a.name.endsWith(".pdf"),
          );
        }
      }

      const completed = await this.repo.completeJob(job.id, {
        status: output.status,
        errorCode: output.status === "succeeded" ? null : output.status.toUpperCase(),
        diagnostics: output.diagnostics,
        pdfAvailable,
      });

      return { job: completed ?? job, completed: true };
    } catch (err: unknown) {
      const isAbort = (err as Error)?.name === "AbortError" || abortController.signal.aborted;
      const isTimeout =
        (err as { code?: string })?.code === "TIMEOUT" ||
        (err as Error)?.message?.includes("timed out");

      const terminalStatus = isAbort ? "cancelled" : isTimeout ? "timed_out" : "failed";
      const errorCode = isAbort ? "CANCELLED" : isTimeout ? "TIMEOUT" : "EXECUTION_ERROR";

      const completed = await this.repo.completeJob(job.id, {
        status: terminalStatus,
        errorCode,
        diagnostics: [
          {
            severity: "error",
            message: (err as Error)?.message ?? "Compilation error",
          },
        ],
        pdfAvailable: false,
      });

      return { job: completed ?? job, completed: true };
    } finally {
      clearInterval(heartbeatInterval);
    }
  }

  /**
   * Runs a compilation pass across queued jobs.
   */
  async runPass(options: CompilationPassOptions = {}): Promise<CompilationPassResult> {
    const limit = options.limit ?? 5;
    const result: CompilationPassResult = {
      claimed: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
      recovered: 0,
    };

    result.recovered = await this.recoverStale(
      options.now !== undefined ? { now: options.now } : {},
    );

    for (let i = 0; i < limit; i++) {
      const passOpts: {
        now?: Date;
        leaseMs?: number;
        executor?: CompilerExecutor;
        storage?: StorageAdapter;
      } = {};
      if (options.now !== undefined) passOpts.now = options.now;
      if (options.leaseMs !== undefined) passOpts.leaseMs = options.leaseMs;
      if (options.executor !== undefined) passOpts.executor = options.executor;
      if (options.storage !== undefined) passOpts.storage = options.storage;

      const { job, completed } = await this.processNextJob(passOpts);
      if (!job) break;
      result.claimed += 1;
      if (completed) {
        if (job.status === "succeeded") result.completed += 1;
        else if (job.status === "cancelled") result.cancelled += 1;
        else result.failed += 1;
      }
    }

    return result;
  }
}
