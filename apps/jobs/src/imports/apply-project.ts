import { createHash, randomUUID } from "node:crypto";
import type { StorageAdapter } from "@latex-collab/storage";
import { assertImportKeyScope, maxArchiveBytes, StorageLimitError } from "@latex-collab/storage";
import {
  assertUUID,
  type DatabaseClient,
  mapDatabaseError,
  PersistenceError,
} from "@latex-collab/db";
import * as Y from "yjs";
import {
  ImportJobRepository,
  type ImportApplyJobView,
  type ImportJobView,
  type ImportManifestEntry,
} from "@latex-collab/db/repositories/import-jobs";
import { readArchiveForApply, ZipValidationError } from "./zip.js";

export type ImportFileKind = "TEXT" | "BINARY";

export type ImportFileBytes = {
  data: Buffer;
  mime: string;
  sha256: string;
  kind: ImportFileKind;
};

/** Content-addressed private key for one verified import binary. */
export function importBlobKey(projectId: string, sha256: string): string {
  return `projects/${projectId}/blobs/${sha256}`;
}

/**
 * Writes every manifest-declared binary to its verified content-addressed
 * key before any project row exists. Keys are deterministic, so a retry
 * reconciles the same objects. A storage failure propagates with the job
 * still validated and no project row, and no key ever reaches the caller.
 */
export async function prepareImportBlobs(
  storage: StorageAdapter,
  projectId: string,
  files: Map<string, ImportFileBytes>,
): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  for (const [path, file] of files) {
    if (file.kind !== "BINARY") continue;
    const key = importBlobKey(projectId, file.sha256);
    const stored = await storage.put(key, file.data, file.mime);
    if (stored.sha256 !== file.sha256 || stored.sizeBytes !== file.data.length) {
      throw new Error("Import blob verification failed");
    }
    keys.set(path, key);
  }
  return keys;
}

function encodeInitialText(source: Buffer): Buffer {
  const doc = new Y.Doc();
  try {
    doc.getText("content").insert(0, source.toString("utf8"));
    return Buffer.from(Y.encodeStateAsUpdate(doc));
  } finally {
    doc.destroy();
  }
}

/** Root `main.tex`, else the first sorted `.tex`, else the first sorted text. */
function chooseMainFile(entries: ImportManifestEntry[]): string | null {
  const texts = entries.filter((entry) => entry.kind === "TEXT").map((entry) => entry.path);
  if (texts.length === 0) return null;
  if (texts.includes("main.tex")) return "main.tex";
  const tex = texts.filter((path) => path.toLowerCase().endsWith(".tex")).sort();
  if (tex[0]) return tex[0];
  return [...texts].sort()[0]!;
}

/**
 * Applies one validated job as one durable project. The archive is re-read
 * and re-verified (size, SHA-256, full manifest, path collisions) before any
 * write; blobs are prepared under the reserved project ID; then one
 * transaction inserts the project, parent-before-child nodes, canonical Yjs
 * updates and the `succeeded` transition. A concurrent winner is returned
 * instead of duplicated; anything else leaves no partial project and keeps
 * the job validated for retry.
 */
export async function applyValidatedImport(
  db: DatabaseClient,
  storage: StorageAdapter,
  jobId: string,
): Promise<ImportJobView> {
  assertUUID(jobId, "jobId");
  const jobs = new ImportJobRepository(db);
  const known = await jobs.get(jobId);
  if (!known) throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job not found", false);
  if (known.status === "succeeded") {
    if (!known.projectId) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job has no project", false);
    }
    return known;
  }
  if (known.status !== "validated") {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job is not validated", false);
  }
  // A concurrent applier may commit between this read and the reservation;
  // in that case return the winner's project instead of duplicating it.
  let reserved: ImportApplyJobView;
  try {
    reserved = await jobs.reserveProjectId(jobId);
  } catch (error) {
    const current = await jobs.get(jobId);
    if (current?.status === "succeeded" && current.projectId) return current;
    throw error;
  }
  const projectId = reserved.pendingProjectId;
  if (!projectId) {
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job has no reservation", false);
  }
  assertImportKeyScope(reserved.archiveKey, reserved.actorId);
  let archive: Uint8Array;
  try {
    archive = await storage.getLimited(reserved.archiveKey, maxArchiveBytes);
  } catch (error) {
    if (error instanceof StorageLimitError) throw new ZipValidationError("LIMIT_EXCEEDED");
    throw error;
  }
  if (archive.length !== reserved.archiveSize) {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  const archiveDigest = createHash("sha256").update(archive).digest("hex");
  if (archiveDigest !== reserved.archiveSha256) {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  if (!reserved.manifest) throw new ZipValidationError("INVALID_ARCHIVE");
  const manifest = reserved.manifest;
  const raw = await readArchiveForApply(archive, manifest);
  const files = new Map<string, ImportFileBytes>();
  for (const entry of manifest.entries) {
    if (entry.kind === "DIRECTORY") continue;
    const data = raw.get(entry.path);
    if (!data) throw new ZipValidationError("INVALID_ARCHIVE");
    files.set(entry.path, { data, mime: entry.mime, sha256: entry.sha256, kind: entry.kind });
  }
  const blobKeys = await prepareImportBlobs(storage, projectId, files);
  const mainPath = chooseMainFile(manifest.entries);

  return await db.transaction(async (tx) => {
    const locked = await tx.query<{
      id: string;
      actor_id: string;
      title: string;
      status: string;
      project_id: string | null;
    }>("SELECT id, actor_id, title, status, project_id FROM import_jobs WHERE id = $1 FOR UPDATE", [
      jobId,
    ]);
    const row = locked.rows[0];
    if (!row) throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job not found", false);
    if (row.status === "succeeded") {
      const existing = await jobs.get(jobId);
      if (!existing || !existing.projectId) {
        throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job has no project", false);
      }
      return existing;
    }
    if (row.status !== "validated") {
      throw new PersistenceError("CONSTRAINT_VIOLATION", "Import job is not validated", false);
    }

    await tx.query(
      `INSERT INTO projects (id, owner_id, title, description, compiler, status, current_revision, main_file_id)
       VALUES ($1, $2, $3, NULL, 'pdflatex', 'active', 0, NULL)`,
      [projectId, row.actor_id, row.title],
    );

    const dirPaths = new Set<string>();
    for (const entry of manifest.entries) {
      const path = entry.kind === "DIRECTORY" ? entry.path.replace(/\/$/, "") : entry.path;
      const parts = path.split("/").slice(0, -1);
      for (let depth = 1; depth <= parts.length; depth++) {
        dirPaths.add(parts.slice(0, depth).join("/"));
      }
    }
    const nodeIds = new Map<string, string>();
    const sortedDirs = [...dirPaths].sort(
      (left, right) => left.split("/").length - right.split("/").length,
    );
    for (const dirPath of sortedDirs) {
      const parentPath = dirPath.includes("/") ? dirPath.slice(0, dirPath.lastIndexOf("/")) : null;
      const nodeId = randomUUID();
      await tx.query(
        `INSERT INTO project_nodes
           (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
         VALUES ($1, $2, $3, $4, 'FOLDER', 'inode/directory', 'TEXT', 0, NULL)`,
        [
          nodeId,
          projectId,
          parentPath === null ? null : nodeIds.get(parentPath),
          dirPath.slice(dirPath.lastIndexOf("/") + 1),
        ],
      );
      nodeIds.set(dirPath, nodeId);
    }
    let mainFileId: string | null = null;
    for (const entry of manifest.entries) {
      if (entry.kind === "DIRECTORY") continue;
      const parentPath = entry.path.includes("/")
        ? entry.path.slice(0, entry.path.lastIndexOf("/"))
        : null;
      const nodeId = randomUUID();
      const source = files.get(entry.path)!.data;
      await tx.query(
        `INSERT INTO project_nodes
           (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
         VALUES ($1, $2, $3, $4, 'FILE', $5, $6, $7, $8)`,
        [
          nodeId,
          projectId,
          parentPath === null ? null : nodeIds.get(parentPath),
          entry.path.slice(entry.path.lastIndexOf("/") + 1),
          entry.mime,
          entry.kind,
          source.length,
          entry.kind === "BINARY" ? blobKeys.get(entry.path) : null,
        ],
      );
      nodeIds.set(entry.path, nodeId);
      if (entry.kind === "TEXT") {
        const update = encodeInitialText(source);
        await tx.query(
          "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
          [nodeId, projectId],
        );
        await tx.query(
          `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes, created_at)
           VALUES ($1, $2, 1, $3, $4, NOW())`,
          [randomUUID(), nodeId, row.actor_id, update],
        );
      }
      if (entry.path === mainPath) mainFileId = nodeId;
    }
    if (mainFileId !== null) {
      await tx.query("UPDATE projects SET main_file_id = $1 WHERE id = $2", [
        mainFileId,
        projectId,
      ]);
    }
    try {
      const completed = await tx.query<Record<string, unknown>>(
        `UPDATE import_jobs
            SET status = 'succeeded', project_id = $2, lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $1 AND status = 'validated'
          RETURNING id, actor_id, archive_sha256, archive_size, title, archive_key, status,
            lease_expires_at, attempts, manifest, manifest_version, error_code, archive_swept,
            project_id, created_at, updated_at`,
        [jobId, projectId],
      );
      const done = completed.rows[0];
      // Unreachable: this transaction holds the job row lock and verified
      // `validated` above, so only a concurrent commit could have moved it —
      // and that path returns early with the winner's project.
      if (!done) {
        throw new PersistenceError("TRANSACTION_CONFLICT", "Import apply raced", true);
      }
      return {
        id: done["id"] as string,
        actorId: done["actor_id"] as string,
        archiveSha256: done["archive_sha256"] as string,
        archiveSize: Number(done["archive_size"]),
        title: done["title"] as string,
        archiveKey: done["archive_key"] as string,
        status: done["status"] as "succeeded",
        leaseExpiresAt: null,
        attempts: Number(done["attempts"]),
        manifest: done["manifest"] as ImportJobView["manifest"],
        manifestVersion: done["manifest_version"] as number | null,
        errorCode: null,
        archiveSwept: done["archive_swept"] as boolean,
        projectId: done["project_id"] as string,
        createdAt: done["created_at"] as Date,
        updatedAt: done["updated_at"] as Date,
      };
    } catch (error) {
      throw mapDatabaseError(error);
    }
  });
}

export type ImportApplyOptions = {
  limit?: number | undefined;
  sweepLimit?: number | undefined;
  retentionDays?: number | undefined;
  now?: Date | undefined;
};

export type ImportApplyResult = {
  succeeded: number;
  failed: number;
  retried: number;
  swept: number;
};

/**
 * Bounded private apply pass. Claims validated jobs one at a time and
 * applies them. A job whose server-only archive is confirmed missing fails
 * permanently (its bytes can never be re-verified); other failures stay
 * validated for a later pass and count as retried. Succeeded jobs past
 * retention have their server-only archives swept; project blobs are never
 * sweep targets.
 */
export async function runImportApplyPass(
  db: DatabaseClient,
  storage: StorageAdapter,
  options: ImportApplyOptions = {},
): Promise<ImportApplyResult> {
  const limit = options.limit ?? 5;
  const sweepLimit = options.sweepLimit ?? 25;
  const retentionDays = options.retentionDays ?? 14;
  const now = options.now ?? new Date();
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(sweepLimit) ||
    sweepLimit < 1 ||
    sweepLimit > 100 ||
    !Number.isSafeInteger(retentionDays) ||
    retentionDays < 0 ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error("Invalid import apply options");
  }
  const jobs = new ImportJobRepository(db);
  const result: ImportApplyResult = { succeeded: 0, failed: 0, retried: 0, swept: 0 };
  for (let claimed = 0; claimed < limit; claimed++) {
    const picked = await db.transaction(async (tx) => {
      const found = await tx.query<{ id: string }>(
        `SELECT id FROM import_jobs WHERE status = 'validated'
          ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [],
      );
      return found.rows[0]?.id ?? null;
    });
    if (!picked) break;
    try {
      const meta = await jobs.getForApply(picked);
      if (!meta || meta.status !== "validated") continue;
      let exists: boolean;
      try {
        exists = (await storage.head(meta.archiveKey)) !== null;
      } catch {
        result.retried += 1;
        continue;
      }
      if (!exists) {
        await jobs.failApply(picked, "INVALID_ARCHIVE");
        await jobs.markArchiveSwept(picked);
        result.failed += 1;
        continue;
      }
      await applyValidatedImport(db, storage, picked);
      result.succeeded += 1;
    } catch (error) {
      // Re-verification failures are permanent for this job row: replaced
      // bytes, a tampered manifest and policy drift never heal by retrying,
      // and leaving the row validated would wedge FIFO behind it. Fail it
      // and sweep its server-only archive like the validation worker does;
      // transient outages propagate as retried instead.
      if (error instanceof ZipValidationError) {
        try {
          const meta = await jobs.getForApply(picked);
          await jobs.failApply(picked, error.code);
          if (meta) {
            try {
              if (await storage.head(meta.archiveKey)) {
                await storage.delete(meta.archiveKey);
              }
            } catch {
              // Retryable on a later pass via the unswept sweep.
            }
          }
          await jobs.markArchiveSwept(picked);
          result.failed += 1;
        } catch {
          result.retried += 1;
        }
      } else {
        result.retried += 1;
      }
    }
  }
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60_000);
  const stale = await jobs.listSweepableSucceeded(cutoff, sweepLimit);
  for (const job of stale) {
    try {
      if (await storage.head(job.archiveKey)) {
        await storage.delete(job.archiveKey);
      }
      await jobs.markSucceededArchiveSwept(job.id);
      result.swept += 1;
    } catch {
      // Retryable on a later pass. Project state is untouched.
    }
  }
  return result;
}
