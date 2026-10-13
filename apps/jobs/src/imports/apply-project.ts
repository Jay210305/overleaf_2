import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import type { DatabaseClient } from "@latex-collab/db";
import {
  ImportJobRepository,
  type ImportJobView,
  type ImportManifest,
} from "@latex-collab/db/repositories/import-jobs";
import {
  assertImportKeyScope,
  buildImportArchiveKey,
  maxArchiveBytes,
  maxFileBytes,
  StorageLimitError,
  type StorageAdapter,
} from "@latex-collab/storage";
import { readArchiveForApply, ZipValidationError } from "./zip.js";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameManifest(left: ImportManifest | null, right: ImportManifest | null): boolean {
  return left !== null && right !== null && JSON.stringify(left) === JSON.stringify(right);
}

/** Prepare retryable, content-addressed project blobs before the DB commit. */
export async function prepareImportBlobs(
  storage: StorageAdapter,
  job: ImportJobView,
  files: Map<string, Buffer>,
): Promise<Map<string, string>> {
  if (job.status !== "validated" || !job.pendingProjectId || !job.manifest) {
    throw new Error("Import job is not prepared for project application");
  }
  const paths = new Map<string, string>();
  const verifiedKeys = new Set<string>();
  for (const entry of job.manifest.entries) {
    if (entry.kind !== "BINARY") continue;
    const bytes = files.get(entry.path);
    if (!bytes || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
      throw new ZipValidationError("INVALID_ARCHIVE");
    }
    const key = `projects/${job.pendingProjectId}/blobs/${entry.sha256}`;
    if (!verifiedKeys.has(key)) {
      const stored = await storage.put(key, bytes, entry.mime);
      if (stored.sizeBytes !== entry.size || stored.sha256 !== entry.sha256) {
        throw new Error("Import blob write could not be verified");
      }
      const copied = await storage.getLimited(key, maxFileBytes);
      if (copied.length !== entry.size || sha256(copied) !== entry.sha256) {
        throw new Error("Import blob copy could not be verified");
      }
      verifiedKeys.add(key);
    }
    paths.set(entry.path, key);
  }
  return paths;
}

/** Apply a validated, server-owned archive as one visible project. */
export async function applyValidatedImport(
  db: DatabaseClient,
  storage: StorageAdapter,
  jobId: string,
): Promise<ImportJobView> {
  const jobs = new ImportJobRepository(db);
  const initial = await jobs.get(jobId);
  if (!initial) throw new Error("Import job does not exist");
  if (initial.status === "succeeded") return initial;
  if (initial.status !== "validated" || !initial.manifest) {
    throw new Error("Import job is not validated");
  }
  if (initial.manifestVersion !== 1 || initial.manifest.version !== 1) {
    await jobs.failValidated(jobId, "INVALID_ARCHIVE");
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  assertImportKeyScope(initial.archiveKey, initial.actorId);
  if (initial.archiveKey !== buildImportArchiveKey(initial.actorId, initial.id)) {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  let files: Map<string, Buffer>;
  try {
    const head = await storage.head(initial.archiveKey);
    if (!head || head.sizeBytes !== initial.archiveSize || head.sizeBytes > maxArchiveBytes) {
      throw new ZipValidationError(
        head && head.sizeBytes > maxArchiveBytes ? "LIMIT_EXCEEDED" : "INVALID_ARCHIVE",
      );
    }
    const archive = await storage.getLimited(initial.archiveKey, maxArchiveBytes);
    if (archive.length !== initial.archiveSize || sha256(archive) !== initial.archiveSha256) {
      throw new ZipValidationError("INVALID_ARCHIVE");
    }
    files = await readArchiveForApply(archive, initial.manifest);
  } catch (error) {
    if (error instanceof ZipValidationError || error instanceof StorageLimitError) {
      await jobs.failValidated(
        jobId,
        error instanceof StorageLimitError ? "LIMIT_EXCEEDED" : error.code,
      );
    }
    throw error;
  }
  const reserved = await jobs.reserveProjectId(jobId);
  if (reserved.status === "succeeded") return reserved;
  if (!reserved.pendingProjectId || !reserved.manifest)
    throw new Error("Missing project reservation");
  if (
    !sameManifest(initial.manifest, reserved.manifest) ||
    initial.manifestVersion !== reserved.manifestVersion ||
    initial.archiveSha256 !== reserved.archiveSha256 ||
    initial.archiveSize !== reserved.archiveSize ||
    initial.actorId !== reserved.actorId ||
    initial.archiveKey !== reserved.archiveKey ||
    initial.title !== reserved.title
  ) {
    await jobs.failValidated(jobId, "INVALID_ARCHIVE");
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  const manifest = reserved.manifest;
  const blobs = await prepareImportBlobs(storage, reserved, files);
  try {
    await db.transaction(async (tx) => {
      const locked = await tx.query<{
        status: string;
        pending_project_id: string | null;
        manifest: ImportManifest | null;
        manifest_version: number | null;
        archive_sha256: string;
        archive_size: string;
        actor_id: string;
        archive_key: string;
        title: string;
      }>(
        `SELECT status, pending_project_id, manifest, manifest_version,
              archive_sha256, archive_size, actor_id, archive_key, title
       FROM import_jobs WHERE id = $1 FOR UPDATE`,
        [jobId],
      );
      const row = locked.rows[0];
      if (row?.status === "succeeded") return;
      if (row?.status !== "validated" || row.pending_project_id !== reserved.pendingProjectId) {
        throw new Error("Import job changed during project application");
      }
      if (
        !sameManifest(manifest, row.manifest) ||
        row.manifest_version !== reserved.manifestVersion ||
        row.archive_sha256 !== reserved.archiveSha256 ||
        Number(row.archive_size) !== reserved.archiveSize ||
        row.actor_id !== reserved.actorId ||
        row.archive_key !== reserved.archiveKey ||
        row.title !== reserved.title
      ) {
        throw new ZipValidationError("INVALID_ARCHIVE");
      }
      const projectId = reserved.pendingProjectId;
      await tx.query(
        `INSERT INTO projects (id, owner_id, title, compiler, status, current_revision)
       VALUES ($1, $2, $3, 'pdflatex', 'active', 0)`,
        [projectId, reserved.actorId, reserved.title],
      );
      const directories = new Set<string>();
      for (const entry of manifest.entries) {
        if (entry.kind === "DIRECTORY") directories.add(entry.path);
        const segments = entry.path.split("/");
        for (let depth = 1; depth < segments.length; depth++) {
          directories.add(segments.slice(0, depth).join("/"));
        }
      }
      const nodeIds = new Map<string, string>();
      const parentId = (path: string): string | null => {
        const slash = path.lastIndexOf("/");
        return slash < 0 ? null : (nodeIds.get(path.slice(0, slash)) ?? null);
      };
      for (const path of [...directories].sort(
        (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
      )) {
        const id = randomUUID();
        await tx.query(
          `INSERT INTO project_nodes
          (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
         VALUES ($1, $2, $3, $4, 'FOLDER', 'application/x-directory', 'TEXT', 0)`,
          [id, projectId, parentId(path), path.split("/").at(-1)],
        );
        nodeIds.set(path, id);
      }
      for (const entry of manifest.entries) {
        if (entry.kind === "DIRECTORY") continue;
        const bytes = files.get(entry.path);
        if (!bytes) throw new ZipValidationError("INVALID_ARCHIVE");
        const id = randomUUID();
        await tx.query(
          `INSERT INTO project_nodes
          (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
         VALUES ($1, $2, $3, $4, 'FILE', $5, $6, $7, $8)`,
          [
            id,
            projectId,
            parentId(entry.path),
            entry.path.split("/").at(-1),
            entry.mime,
            entry.kind,
            entry.size,
            entry.kind === "BINARY" ? blobs.get(entry.path) : null,
          ],
        );
        nodeIds.set(entry.path, id);
        if (entry.kind === "TEXT") {
          const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          const doc = new Y.Doc();
          doc.getText("content").insert(0, source);
          const update = Buffer.from(Y.encodeStateAsUpdate(doc));
          doc.destroy();
          await tx.query(
            "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
            [id, projectId],
          );
          await tx.query(
            `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes)
           VALUES ($1, $2, 1, $3, $4)`,
            [randomUUID(), id, reserved.actorId, update],
          );
        }
      }
      const texPaths = manifest.entries
        .filter((entry) => entry.kind === "TEXT" && entry.path.endsWith(".tex"))
        .map((entry) => entry.path)
        .sort();
      const mainPath = texPaths.includes("main.tex") ? "main.tex" : texPaths[0];
      if (mainPath) {
        await tx.query("UPDATE projects SET main_file_id = $1 WHERE id = $2", [
          nodeIds.get(mainPath),
          projectId,
        ]);
      }
      await tx.query(
        `UPDATE import_jobs SET status = 'succeeded', project_id = $2,
          lease_expires_at = NULL, updated_at = NOW()
       WHERE id = $1`,
        [jobId, projectId],
      );
    });
  } catch (error) {
    if (error instanceof ZipValidationError) await jobs.failValidated(jobId, error.code);
    throw error;
  }
  const applied = await jobs.get(jobId);
  if (!applied || applied.status !== "succeeded") throw new Error("Import commit was not visible");
  return applied;
}

/** Sweep only retained source archives, never project blobs. */
export async function sweepExpiredImportArchives(
  db: DatabaseClient,
  storage: StorageAdapter,
  now: Date = new Date(),
  limit = 25,
): Promise<number> {
  const jobs = new ImportJobRepository(db);
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60_000);
  const expired = await jobs.listExpiredSucceeded(cutoff, limit);
  let swept = 0;
  for (const job of expired) {
    try {
      assertImportKeyScope(job.archiveKey, job.actorId);
      if (job.archiveKey !== buildImportArchiveKey(job.actorId, job.id)) continue;
      if (await storage.head(job.archiveKey)) await storage.delete(job.archiveKey);
      await jobs.markArchiveSwept(job.id);
      swept++;
    } catch {
      // The durable unswept row is retried on the next pass.
    }
  }
  return swept;
}

async function sweepFailedImportArchives(
  db: DatabaseClient,
  jobs: ImportJobRepository,
  storage: StorageAdapter,
): Promise<void> {
  for (const job of await jobs.listUnswept(25, true)) {
    try {
      assertImportKeyScope(job.archiveKey, job.actorId);
      if (job.archiveKey !== buildImportArchiveKey(job.actorId, job.id)) continue;
      if (!job.pendingProjectId) continue;
      const project = await db.query("SELECT id FROM projects WHERE id = $1", [
        job.pendingProjectId,
      ]);
      if (project.rows.length > 0) continue;
      const prefix = `projects/${job.pendingProjectId}/blobs/`;
      const page = await storage.list(prefix, undefined, 25);
      for (const object of page.objects) {
        if (!object.key.startsWith(prefix))
          throw new Error("Import blob listing escaped project scope");
        await storage.delete(object.key);
      }
      if ((await storage.list(prefix, undefined, 1)).objects.length > 0) continue;
      if (await storage.head(job.archiveKey)) await storage.delete(job.archiveKey);
      await jobs.markArchiveSwept(job.id);
    } catch {
      // Failed archive cleanup is retryable through the durable job row.
    }
  }
}

/** Bounded private pass over validated jobs, including retryable outages. */
export async function runImportApplyPass(
  db: DatabaseClient,
  storage: StorageAdapter,
  limit = 5,
): Promise<{ succeeded: number; failed: number; retried: number }> {
  const jobs = new ImportJobRepository(db);
  const pending = await jobs.listValidated(limit);
  const result = { succeeded: 0, failed: 0, retried: 0 };
  for (const job of pending) {
    try {
      const applied = await applyValidatedImport(db, storage, job.id);
      if (applied.status === "succeeded") result.succeeded++;
    } catch {
      const current = await jobs.get(job.id);
      if (current?.status === "failed") result.failed++;
      else {
        if (current?.status === "validated") await jobs.deferApply(job.id);
        result.retried++;
      }
    }
  }
  await sweepFailedImportArchives(db, jobs, storage);
  await sweepExpiredImportArchives(db, storage);
  return result;
}
