import type { DatabaseClient, TransactionContext } from "@latex-collab/db";
import { isUUID } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";

const defaultMinimumAgeMs = 10 * 60_000;
const defaultMaxDeletes = 25;
const pageSize = 1000;

export type StorageGcOptions = {
  projectId?: string;
  actorId?: string;
  now?: Date;
  maxDeletes?: number;
  minimumAgeMs?: number;
};

export type StorageGcResult = {
  scanned: number;
  deleted: number;
  retained: number;
  failed: number;
};

type Candidate =
  | { projectId: string; key: string; kind: "upload" | "blob"; hash?: string }
  | { actorId: string; key: string; kind: "import-upload" };

function candidate(projectId: string, key: string): Candidate | null {
  const uploadPrefix = `projects/${projectId}/uploads/`;
  const blobPrefix = `projects/${projectId}/blobs/`;
  if (key.startsWith(uploadPrefix)) {
    const uploadId = key.slice(uploadPrefix.length);
    return isUUID(uploadId) ? { projectId, key, kind: "upload" } : null;
  }
  if (key.startsWith(blobPrefix)) {
    const hash = key.slice(blobPrefix.length);
    return /^[a-f0-9]{64}$/.test(hash) ? { projectId, key, kind: "blob", hash } : null;
  }
  return null;
}

const importUploadPattern = /^imports\/([0-9a-f-]{36})\/uploads\/([0-9a-f-]{36})$/i;

function importCandidate(key: string): Candidate | null {
  const match = importUploadPattern.exec(key);
  if (!match) return null;
  const [, actorId, uploadId] = match;
  if (!isUUID(actorId) || !isUUID(uploadId)) return null;
  return { actorId, key, kind: "import-upload" };
}

async function isReferenced(
  tx: TransactionContext,
  object: Candidate,
  now: Date,
): Promise<boolean> {
  if (object.kind === "import-upload") {
    const result = await tx.query<{ used: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM import_upload_intents
         WHERE actor_id = $1 AND staging_key = $2 AND expires_at > $3
       ) AS used`,
      [object.actorId, object.key, now],
    );
    return result.rows[0]?.used ?? true;
  }
  if (object.kind === "upload") {
    const result = await tx.query<{ used: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pending_uploads
         WHERE project_id = $1 AND staging_key = $2 AND expires_at > $3
       ) AS used`,
      [object.projectId, object.key, now],
    );
    return result.rows[0]?.used ?? true;
  }
  const result = await tx.query<{ used: boolean }>(
    `SELECT (
       EXISTS (SELECT 1 FROM project_nodes WHERE blob_key = $1)
       OR EXISTS (SELECT 1 FROM revision_items WHERE blob_key = $1)
       -- Revision items currently cascade on physical node deletion. A surviving
       -- revision therefore makes every project blob potentially historical.
       OR EXISTS (SELECT 1 FROM project_revisions WHERE project_id = $2)
       OR EXISTS (SELECT 1 FROM project_revisions WHERE manifest_key = $1)
       OR EXISTS (
         SELECT 1 FROM artifact_sets
         WHERE pdf_key = $1 OR log_key = $1 OR synctex_key = $1 OR aux_manifest_key = $1
       )
       OR EXISTS (
         SELECT 1 FROM pending_uploads
         WHERE project_id = $2 AND content_kind = 'BINARY'
           AND expected_sha256 = $3 AND expires_at > $4
       )
     ) AS used`,
    [object.key, object.projectId, object.hash, now],
  );
  return result.rows[0]?.used ?? true;
}

/**
 * One private maintenance pass. Candidate keys come only from known projects
 * (plus actor-scoped import staging); each deletion is revalidated against
 * current durable references under the same project lock used by upload
 * completion and checkpoint creation. Server-only import job archives are
 * owned by the import worker and never touched here.
 */
export async function runStorageGc(
  db: DatabaseClient,
  storage: StorageAdapter,
  options: StorageGcOptions = {},
): Promise<StorageGcResult> {
  const now = options.now ?? new Date();
  const minimumAgeMs = options.minimumAgeMs ?? defaultMinimumAgeMs;
  const maxDeletes = options.maxDeletes ?? defaultMaxDeletes;
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isSafeInteger(minimumAgeMs) ||
    minimumAgeMs < defaultMinimumAgeMs ||
    !Number.isSafeInteger(maxDeletes) ||
    maxDeletes < 1 ||
    maxDeletes > 1000 ||
    (options.projectId !== undefined && !isUUID(options.projectId)) ||
    (options.actorId !== undefined && !isUUID(options.actorId))
  ) {
    throw new Error("Invalid storage cleanup options");
  }
  const cutoff = now.getTime() - minimumAgeMs;
  const result: StorageGcResult = { scanned: 0, deleted: 0, retained: 0, failed: 0 };
  const projects = await db.query<{ id: string }>(
    options.projectId
      ? "SELECT id FROM projects WHERE id = $1 ORDER BY id"
      : "SELECT id FROM projects ORDER BY id",
    options.projectId ? [options.projectId] : [],
  );

  if (!options.actorId) {
    for (const project of projects.rows) {
      for (const folder of ["uploads", "blobs"] as const) {
        const prefix = `projects/${project.id}/${folder}/`;
        let cursor: string | undefined;
        do {
          const page = await storage.list(prefix, cursor, pageSize);
          for (const item of page.objects) {
            result.scanned++;
            if (result.deleted >= maxDeletes) return result;
            const target = candidate(project.id, item.key);
            if (!target || !item.lastModified || item.lastModified.getTime() > cutoff) {
              result.retained++;
              continue;
            }
            try {
              const outcome = await db.transaction(async (tx) => {
                const locked = await tx.query<{ id: string }>(
                  "SELECT id FROM projects WHERE id = $1 FOR UPDATE",
                  [project.id],
                );
                if (!locked.rows[0]) return "retained" as const;
                const current = await storage.head(item.key);
                if (!current) return "retained" as const;
                if (!current.lastModified || current.lastModified.getTime() > cutoff)
                  return "retained" as const;
                if (await isReferenced(tx, target, now)) return "retained" as const;
                await storage.delete(item.key);
                return "deleted" as const;
              });
              result[outcome]++;
            } catch {
              // A later pass retries the same listed object. No key or source is logged.
              result.failed++;
            }
          }
          cursor = page.cursor ?? undefined;
        } while (cursor);
      }
    }
  }
  if (!options.projectId) {
    // Actor-scoped runs touch only that actor's import staging; projectId
    // runs keep their legacy project-only behavior. Server-only job
    // archives (imports/<actor>/jobs/…) are worker-owned, never GC targets.
    const prefix = options.actorId ? `imports/${options.actorId}/` : "imports/";
    let cursor: string | undefined;
    do {
      const page = await storage.list(prefix, cursor, pageSize);
      for (const item of page.objects) {
        result.scanned++;
        if (result.deleted >= maxDeletes) return result;
        const target = importCandidate(item.key);
        if (!target || !item.lastModified || item.lastModified.getTime() > cutoff) {
          result.retained++;
          continue;
        }
        try {
          const current = await storage.head(item.key);
          if (!current) {
            result.retained++;
            continue;
          }
          if (!current.lastModified || current.lastModified.getTime() > cutoff) {
            result.retained++;
            continue;
          }
          if (await isReferenced(db, target, now)) {
            result.retained++;
            continue;
          }
          await storage.delete(item.key);
          result.deleted++;
        } catch {
          // A later pass retries the same listed object. No key or source is logged.
          result.failed++;
        }
      }
      cursor = page.cursor ?? undefined;
    } while (cursor);
  }
  return result;
}
