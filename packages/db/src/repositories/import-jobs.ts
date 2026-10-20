import { createHash, randomUUID } from "node:crypto";
import {
  assertUUID,
  DatabaseClient,
  mapDatabaseError,
  PersistenceError,
  type TransactionContext,
} from "../client.js";

export type ImportJobStatus =
  "staging" | "queued" | "validating" | "validated" | "failed" | "succeeded";

export type ImportJobErrorCode = "UNSAFE_PATH" | "LIMIT_EXCEEDED" | "INVALID_ARCHIVE";

export type ImportManifestEntry =
  | { path: string; kind: "DIRECTORY" }
  | {
      path: string;
      kind: "TEXT" | "BINARY";
      mime: string;
      size: number;
      sha256: string;
    };

export type ImportManifest = {
  version: 1;
  entries: ImportManifestEntry[];
};

export type ImportJobView = {
  id: string;
  actorId: string;
  archiveSha256: string;
  archiveSize: number;
  title: string;
  archiveKey: string;
  status: ImportJobStatus;
  leaseExpiresAt: Date | null;
  attempts: number;
  manifest: ImportManifest | null;
  manifestVersion: number | null;
  errorCode: ImportJobErrorCode | null;
  archiveSwept: boolean;
  pendingProjectId: string | null;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReserveImportJobInput = {
  actorId: string;
  idempotencyKey: string;
  archiveSha256: string;
  archiveSize: number;
  title: string;
};

type JobRow = {
  id: string;
  actor_id: string;
  archive_sha256: string;
  archive_size: string;
  title: string;
  archive_key: string;
  status: ImportJobStatus;
  lease_expires_at: Date | null;
  attempts: string;
  manifest: ImportManifest | null;
  manifest_version: number | null;
  error_code: ImportJobErrorCode | null;
  archive_swept: boolean;
  pending_project_id: string | null;
  project_id: string | null;
  created_at: Date;
  updated_at: Date;
};

const HEX64 = /^[a-f0-9]{64}$/;
const STATUSES: ImportJobStatus[] = [
  "staging",
  "queued",
  "validating",
  "validated",
  "failed",
  "succeeded",
];

function toView(row: JobRow): ImportJobView {
  return {
    id: row.id,
    actorId: row.actor_id,
    archiveSha256: row.archive_sha256,
    archiveSize: Number(row.archive_size),
    title: row.title,
    archiveKey: row.archive_key,
    status: row.status,
    leaseExpiresAt: row.lease_expires_at,
    attempts: Number(row.attempts),
    manifest: row.manifest,
    manifestVersion: row.manifest_version,
    errorCode: row.error_code,
    archiveSwept: row.archive_swept,
    pendingProjectId: row.pending_project_id ?? null,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function checkInput(input: ReserveImportJobInput): string {
  assertUUID(input.actorId, "actorId");
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 16 ||
    input.idempotencyKey.length > 128
  ) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid idempotency key", false);
  }
  if (!HEX64.test(input.archiveSha256)) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid archive digest", false);
  }
  if (
    !Number.isSafeInteger(input.archiveSize) ||
    input.archiveSize < 1 ||
    input.archiveSize > 200 * 1024 * 1024
  ) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid archive size", false);
  }
  if (typeof input.title !== "string" || input.title.length < 1 || input.title.length > 200) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid import title", false);
  }
  return createHash("sha256").update(input.idempotencyKey, "utf8").digest("hex");
}

async function findByKey(
  store: DatabaseClient | TransactionContext,
  actorId: string,
  keyHash: string,
): Promise<JobRow | null> {
  const found = await store.query<JobRow>(
    "SELECT * FROM import_jobs WHERE actor_id = $1 AND idempotency_key_hash = $2",
    [actorId, keyHash],
  );
  return found.rows[0] ?? null;
}

function sameFingerprint(row: JobRow, input: ReserveImportJobInput): boolean {
  return (
    row.archive_sha256 === input.archiveSha256 &&
    Number(row.archive_size) === input.archiveSize &&
    row.title === input.title
  );
}

/**
 * Narrow typed reserve/claim repository for ZIP import jobs. It is callable
 * by the S05-T12 intake (reserve/enqueue) and the S05-T03 worker
 * (claim/complete/fail/release). It never writes project, node or text rows.
 */
export class ImportJobRepository {
  constructor(private readonly client: DatabaseClient) {}

  /** Reserve a stable project ID before S05-T10 writes content-addressed blobs. */
  async reserveProjectId(jobId: string): Promise<ImportJobView> {
    assertUUID(jobId, "jobId");
    try {
      const updated = await this.client.query<JobRow>(
        `UPDATE import_jobs
            SET pending_project_id = COALESCE(pending_project_id, $2), updated_at = NOW()
          WHERE id = $1 AND status = 'validated'
          RETURNING *`,
        [jobId, randomUUID()],
      );
      if (updated.rows[0]) return toView(updated.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
    const current = await this.get(jobId);
    if (current?.status === "succeeded" && current.projectId) return current;
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job is not validated", false);
  }

  /**
   * Reserve the deterministic server-only archive key before any byte copy.
   * The same actor/key/fingerprint returns the same job; the same key with
   * changed input throws a non-retryable conflict.
   */
  async reserve(input: ReserveImportJobInput): Promise<{ job: ImportJobView; created: boolean }> {
    const keyHash = checkInput(input);
    const jobId = randomUUID();
    const archiveKey = `imports/${input.actorId}/jobs/${jobId}/source.zip`;
    try {
      const inserted = await this.client.query<JobRow>(
        `INSERT INTO import_jobs
           (id, actor_id, idempotency_key_hash, archive_sha256, archive_size, title, archive_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'staging')
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          jobId,
          input.actorId,
          keyHash,
          input.archiveSha256,
          input.archiveSize,
          input.title,
          archiveKey,
        ],
      );
      if (inserted.rows[0]) return { job: toView(inserted.rows[0]), created: true };
    } catch (error) {
      throw mapDatabaseError(error);
    }
    const existing = await findByKey(this.client, input.actorId, keyHash);
    if (!existing) {
      throw new PersistenceError("TRANSACTION_CONFLICT", "Import reservation raced", true);
    }
    if (!sameFingerprint(existing, input)) {
      throw new PersistenceError(
        "CONSTRAINT_VIOLATION",
        "Idempotency key reused with different import input",
        false,
      );
    }
    return { job: toView(existing), created: false };
  }

  /** Move a staged job to queued after the server-only copy is verified. */
  async enqueue(
    jobId: string,
    input: { archiveSha256: string; archiveSize: number },
  ): Promise<ImportJobView> {
    assertUUID(jobId, "jobId");
    if (!HEX64.test(input.archiveSha256)) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid archive digest", false);
    }
    try {
      const updated = await this.client.query<JobRow>(
        `UPDATE import_jobs
            SET status = 'queued', updated_at = NOW()
          WHERE id = $1 AND status = 'staging'
            AND archive_sha256 = $2 AND archive_size = $3
          RETURNING *`,
        [jobId, input.archiveSha256, input.archiveSize],
      );
      if (updated.rows[0]) return toView(updated.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
    const current = await this.get(jobId);
    if (!current) throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job not found", false);
    if (
      current.archiveSha256 !== input.archiveSha256 ||
      current.archiveSize !== input.archiveSize
    ) {
      throw new PersistenceError(
        "CONSTRAINT_VIOLATION",
        "Verified bytes do not match the reserved import",
        false,
      );
    }
    if (current.status === "queued") return current;
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job is not staged", false);
  }

  /** Atomically claim the oldest queued or lease-expired job for validation. */
  async claimNext(
    input: { now?: Date | undefined; leaseMs?: number | undefined } = {},
  ): Promise<ImportJobView | null> {
    const now = input.now ?? new Date();
    const leaseMs = input.leaseMs ?? 5 * 60_000;
    if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(leaseMs) || leaseMs < 0) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid claim input", false);
    }
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    try {
      const claimed = await this.client.query<JobRow>(
        `UPDATE import_jobs
            SET status = 'validating', lease_expires_at = $1,
                attempts = attempts + 1, updated_at = NOW()
          WHERE id = (
            SELECT id FROM import_jobs
            WHERE status = 'queued'
               OR (status = 'validating' AND lease_expires_at IS NOT NULL AND lease_expires_at <= $2)
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [leaseExpiresAt, now],
      );
      return claimed.rows[0] ? toView(claimed.rows[0]) : null;
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  /** Record a validated manifest. Only the lease holder can complete. */
  async complete(jobId: string, manifest: ImportManifest): Promise<ImportJobView> {
    assertUUID(jobId, "jobId");
    if (manifest?.version !== 1 || !Array.isArray(manifest.entries)) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid import manifest", false);
    }
    try {
      const updated = await this.client.query<JobRow>(
        `UPDATE import_jobs
            SET status = 'validated', manifest = $2::jsonb, manifest_version = 1,
                lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $1 AND status = 'validating'
          RETURNING *`,
        [jobId, JSON.stringify(manifest)],
      );
      if (!updated.rows[0]) {
        throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job is not claimed", false);
      }
      return toView(updated.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  /** Record a permanent validation failure with a redacted error code. */
  async fail(jobId: string, errorCode: ImportJobErrorCode): Promise<ImportJobView> {
    assertUUID(jobId, "jobId");
    if (
      errorCode !== "UNSAFE_PATH" &&
      errorCode !== "LIMIT_EXCEEDED" &&
      errorCode !== "INVALID_ARCHIVE"
    ) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid import error code", false);
    }
    try {
      const updated = await this.client.query<JobRow>(
        `UPDATE import_jobs
            SET status = 'failed', error_code = $2, manifest = NULL, manifest_version = NULL,
                lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $1 AND status = 'validating'
          RETURNING *`,
        [jobId, errorCode],
      );
      if (!updated.rows[0]) {
        throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job is not claimed", false);
      }
      return toView(updated.rows[0]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  /** Release a claim after a retryable outage so a later pass can recover. */
  async release(jobId: string, now: Date = new Date()): Promise<void> {
    assertUUID(jobId, "jobId");
    try {
      await this.client.query(
        `UPDATE import_jobs
            SET lease_expires_at = $2, updated_at = NOW()
          WHERE id = $1 AND status = 'validating'`,
        [jobId, now],
      );
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async get(jobId: string): Promise<ImportJobView | null> {
    assertUUID(jobId, "jobId");
    const found = await this.client.query<JobRow>("SELECT * FROM import_jobs WHERE id = $1", [
      jobId,
    ]);
    if (!found.rows[0] || !STATUSES.includes(found.rows[0].status)) return null;
    return toView(found.rows[0]);
  }

  /** A validated archive that no longer matches its durable manifest cannot be applied. */
  async failValidated(jobId: string, errorCode: ImportJobErrorCode): Promise<ImportJobView> {
    assertUUID(jobId, "jobId");
    if (!["UNSAFE_PATH", "LIMIT_EXCEEDED", "INVALID_ARCHIVE"].includes(errorCode)) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid import error code", false);
    }
    const updated = await this.client.query<JobRow>(
      `UPDATE import_jobs SET status = 'failed', error_code = $2,
          manifest = NULL, manifest_version = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'validated' RETURNING *`,
      [jobId, errorCode],
    );
    if (!updated.rows[0]) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job is not validated", false);
    }
    return toView(updated.rows[0]);
  }

  async listValidated(limit = 5): Promise<ImportJobView[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid apply limit", false);
    }
    const found = await this.client.query<JobRow>(
      `SELECT * FROM import_jobs WHERE status = 'validated'
       AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
       ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    return found.rows.map(toView);
  }

  /** Back off a retryable apply failure so older outages cannot starve later jobs. */
  async deferApply(jobId: string, delayMs = 60_000): Promise<void> {
    assertUUID(jobId, "jobId");
    if (!Number.isSafeInteger(delayMs) || delayMs < 1 || delayMs > 60 * 60_000) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid import retry delay", false);
    }
    await this.client.query(
      `UPDATE import_jobs SET lease_expires_at = NOW() + ($2::bigint * INTERVAL '1 millisecond'),
          updated_at = NOW() WHERE id = $1 AND status = 'validated'`,
      [jobId, delayMs],
    );
  }

  async listExpiredSucceeded(cutoff: Date, limit = 25): Promise<ImportJobView[]> {
    if (
      !Number.isFinite(cutoff.getTime()) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid archive retention query", false);
    }
    const found = await this.client.query<JobRow>(
      `SELECT * FROM import_jobs WHERE status = 'succeeded' AND archive_swept = FALSE
       AND updated_at <= $1 ORDER BY updated_at ASC LIMIT $2`,
      [cutoff, limit],
    );
    return found.rows.map(toView);
  }

  /** Failed jobs whose server-only archives still need sweeping. */
  async listUnswept(limit = 25, withPendingProject = false): Promise<ImportJobView[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid sweep limit", false);
    }
    const found = await this.client.query<JobRow>(
      `SELECT * FROM import_jobs
        WHERE status = 'failed' AND archive_swept = FALSE
          AND (pending_project_id IS NOT NULL) = $2
        ORDER BY created_at ASC LIMIT $1`,
      [limit, withPendingProject],
    );
    return found.rows.map(toView);
  }

  /** Record that a failed or expired successful job's server-only archive is gone. */
  async markArchiveSwept(jobId: string): Promise<void> {
    assertUUID(jobId, "jobId");
    try {
      await this.client.query(
        `UPDATE import_jobs
            SET archive_swept = TRUE, updated_at = NOW()
          WHERE id = $1 AND status IN ('failed', 'succeeded')`,
        [jobId],
      );
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }
}
