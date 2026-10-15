import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";

export interface ArtifactRetentionPolicy {
  defaultRetentionDays: number;
}

export const DEFAULT_RETENTION_POLICY: ArtifactRetentionPolicy = {
  defaultRetentionDays: 30,
};

export interface ExpiredArtifactSet {
  id: string;
  projectId: string;
  pdfKey: string | null;
  logKey: string | null;
  synctexKey: string | null;
  expiresAt: Date;
}

export interface ArtifactCleanupResult {
  scanned: number;
  deletedSets: number;
  deletedStorageKeys: number;
  preservedSourceFiles: boolean;
}

/**
 * Idempotently cleans up expired unreferenced compilation artifacts (CMP-09).
 * - Identifies artifact_sets past their expiresAt timestamp.
 * - Idempotently deletes corresponding storage objects (PDF, log, synctex).
 * - Deletes the expired artifact_sets record.
 * - CRITICAL: Never touches or modifies project source files (files / yjs_documents tables).
 */
export async function cleanupExpiredArtifactSets(
  db: DatabaseClient,
  storage: StorageAdapter,
  options: { now?: Date; maxBatches?: number } = {},
): Promise<ArtifactCleanupResult> {
  const now = options.now ?? new Date();
  const limit = options.maxBatches ?? 100;

  // 1. Query expired unreferenced artifact sets
  const res = await db.query<ExpiredArtifactSet>(
    `SELECT id, project_id AS "projectId", pdf_key AS "pdfKey", log_key AS "logKey", synctex_key AS "synctexKey", expires_at AS "expiresAt"
     FROM artifact_sets
     WHERE expires_at IS NOT NULL AND expires_at < $1
     ORDER BY expires_at ASC
     LIMIT $2`,
    [now, limit],
  );

  const expiredSets = res.rows;
  let deletedStorageKeys = 0;
  let deletedSets = 0;

  for (const set of expiredSets) {
    const keysToDelete = [set.pdfKey, set.logKey, set.synctexKey].filter(
      (k): k is string => Boolean(k) && typeof k === "string"
    );

    // Delete keys from object storage idempotently
    for (const key of keysToDelete) {
      try {
        await storage.delete(key);
        deletedStorageKeys++;
      } catch {
        // Idempotent: ignore if already missing from storage
      }
    }

    // Delete artifact_sets record
    await db.query(
      `DELETE FROM artifact_sets WHERE id = $1`,
      [set.id],
    );
    deletedSets++;
  }

  return {
    scanned: expiredSets.length,
    deletedSets,
    deletedStorageKeys,
    preservedSourceFiles: true, // Invariant: source files are strictly untouched
  };
}

/**
 * In-memory artifact retention manager for deterministic unit and integration tests.
 */
export class InMemoryArtifactRetentionManager {
  private sets = new Map<string, {
    id: string;
    projectId: string;
    keys: string[];
    expiresAt: number;
  }>();
  private storageObjects = new Set<string>();

  public registerArtifactSet(id: string, projectId: string, keys: string[], expiresAt: number): void {
    this.sets.set(id, { id, projectId, keys, expiresAt });
    for (const k of keys) {
      this.storageObjects.add(k);
    }
  }

  public hasStorageKey(key: string): boolean {
    return this.storageObjects.has(key);
  }

  public getArtifactSet(id: string) {
    return this.sets.get(id);
  }

  public cleanupExpired(now: number = Date.now()): ArtifactCleanupResult {
    let deletedSets = 0;
    let deletedKeys = 0;
    let scanned = 0;

    for (const [id, set] of Array.from(this.sets.entries())) {
      scanned++;
      if (set.expiresAt < now) {
        for (const k of set.keys) {
          if (this.storageObjects.has(k)) {
            this.storageObjects.delete(k);
            deletedKeys++;
          }
        }
        this.sets.delete(id);
        deletedSets++;
      }
    }

    return {
      scanned,
      deletedSets,
      deletedStorageKeys: deletedKeys,
      preservedSourceFiles: true,
    };
  }
}
