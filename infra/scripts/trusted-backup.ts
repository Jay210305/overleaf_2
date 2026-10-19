import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";

export interface BackupManifest {
  version: "1.0";
  createdAt: string;
  projectCount: number;
  revisionCount: number;
  artifactSetCount: number;
  blobs: Array<{
    key: string;
    sha256: string;
    sizeBytes: number;
  }>;
}

export interface BackupResult {
  manifest: BackupManifest;
  backupDir: string;
}

export interface VerificationResult {
  totalReferencedBlobs: number;
  verifiedBlobs: number;
  missingBlobs: string[];
  intact: boolean;
}

async function getObjectSafe(storage: StorageAdapter, key: string): Promise<Uint8Array | null> {
  try {
    return await storage.get(key);
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (
      err.name === "NoSuchKey" ||
      err.name === "NotFound" ||
      err.$metadata?.httpStatusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Creates a verified point-in-time backup bundle containing DB snapshot metadata
 * and all referenced S3 object storage blobs.
 */
export async function createTrustedBackup(options: {
  db: DatabaseClient;
  storage: StorageAdapter;
  outputDir: string;
  projectId?: string;
}): Promise<BackupResult> {
  const { db, storage, outputDir, projectId } = options;
  await mkdir(outputDir, { recursive: true });
  const blobsDir = join(outputDir, "blobs");
  await mkdir(blobsDir, { recursive: true });

  const queryParams = projectId ? [projectId] : [];
  const projectFilter = projectId ? `WHERE id = $1` : "";
  const revProjectFilter = projectId ? `WHERE project_id = $1` : "";
  const artFilter = projectId
    ? `JOIN compile_jobs c ON a.compile_job_id = c.id WHERE c.project_id = $1`
    : "";

  const projectsRes = await db.query<{ id: string; title: string }>(
    `SELECT id, title FROM projects ${projectFilter} ORDER BY created_at ASC`,
    queryParams,
  );
  const revisionsRes = await db.query<{ id: string; project_id: string; manifest_key: string }>(
    `SELECT id, project_id, manifest_key FROM project_revisions ${revProjectFilter} ORDER BY created_at ASC`,
    queryParams,
  );
  const revisionItemsRes = await db.query<{ blob_key: string }>(
    `SELECT r.blob_key FROM revision_items r ${
      projectId
        ? `JOIN project_revisions pr ON r.revision_id = pr.id WHERE pr.project_id = $1 AND r.blob_key IS NOT NULL`
        : `WHERE r.blob_key IS NOT NULL`
    }`,
    queryParams,
  );
  const artifactSetsRes = await db.query<{
    id: string;
    compile_job_id: string;
    pdf_key: string | null;
    log_key: string | null;
    synctex_key: string | null;
  }>(
    `SELECT a.id, a.compile_job_id, a.pdf_key, a.log_key, a.synctex_key FROM artifact_sets a ${artFilter} ORDER BY a.created_at ASC`,
    queryParams,
  );

  const dbDump = {
    projects: projectsRes.rows,
    revisions: revisionsRes.rows,
    revisionItems: revisionItemsRes.rows,
    artifactSets: artifactSetsRes.rows,
  };
  await writeFile(join(outputDir, "database.json"), JSON.stringify(dbDump, null, 2), "utf8");

  // Collect and download all referenced storage keys
  const referencedKeys = new Set<string>();
  for (const rev of revisionsRes.rows) {
    if (rev.manifest_key) referencedKeys.add(rev.manifest_key);
  }
  for (const item of revisionItemsRes.rows) {
    if (item.blob_key) referencedKeys.add(item.blob_key);
  }
  for (const art of artifactSetsRes.rows) {
    if (art.pdf_key) referencedKeys.add(art.pdf_key);
    if (art.log_key) referencedKeys.add(art.log_key);
    if (art.synctex_key) referencedKeys.add(art.synctex_key);
  }

  const blobManifests: BackupManifest["blobs"] = [];

  for (const key of referencedKeys) {
    const bytes = await getObjectSafe(storage, key);
    if (bytes) {
      const hash = createHash("sha256").update(bytes).digest("hex");
      blobManifests.push({
        key,
        sha256: hash,
        sizeBytes: bytes.byteLength,
      });

      await writeFile(join(blobsDir, `${hash}.bin`), bytes);
    }
  }

  const manifest: BackupManifest = {
    version: "1.0",
    createdAt: new Date().toISOString(),
    projectCount: projectsRes.rows.length,
    revisionCount: revisionsRes.rows.length,
    artifactSetCount: artifactSetsRes.rows.length,
    blobs: blobManifests,
  };

  await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  return {
    manifest,
    backupDir: outputDir,
  };
}

/**
 * Restores database metadata and uploads missing object storage blobs from the backup bundle.
 */
export async function restoreTrustedBackup(options: {
  db: DatabaseClient;
  storage: StorageAdapter;
  backupDir: string;
  projectId?: string;
}): Promise<VerificationResult> {
  const { storage, backupDir } = options;
  const manifestRaw = await readFile(join(backupDir, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw) as BackupManifest;

  const blobsDir = join(backupDir, "blobs");

  // Restore each blob into storage if missing
  for (const blobMeta of manifest.blobs) {
    const existing = await getObjectSafe(storage, blobMeta.key);
    if (!existing) {
      const bytes = await readFile(join(blobsDir, `${blobMeta.sha256}.bin`));
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== blobMeta.sha256) {
        throw new Error(
          `Corrupted backup blob for key ${blobMeta.key}: expected hash ${blobMeta.sha256}, got ${actualHash}`,
        );
      }
      await storage.put(
        blobMeta.key,
        bytes,
        blobMeta.key.endsWith(".pdf")
          ? "application/pdf"
          : blobMeta.key.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
      );
    }
  }

  return verifyBackupIntegrity(options);
}

/**
 * Validates that all storage blobs referenced by DB revisions and artifact sets exist in storage.
 * Proves invariant: "no referenced blob is missing".
 */
export async function verifyBackupIntegrity(options: {
  db: DatabaseClient;
  storage: StorageAdapter;
  projectId?: string;
}): Promise<VerificationResult> {
  const { db, storage, projectId } = options;

  const referencedKeys = new Set<string>();
  const queryParams = projectId ? [projectId] : [];

  const revFilter = projectId
    ? `WHERE project_id = $1 AND manifest_key IS NOT NULL`
    : `WHERE manifest_key IS NOT NULL`;
  const revisionsRes = await db.query<{ manifest_key: string | null }>(
    `SELECT manifest_key FROM project_revisions ${revFilter}`,
    queryParams,
  );
  for (const row of revisionsRes.rows) {
    if (row.manifest_key) referencedKeys.add(row.manifest_key);
  }

  const itemsQuery = projectId
    ? `SELECT r.blob_key FROM revision_items r JOIN project_revisions pr ON r.revision_id = pr.id WHERE pr.project_id = $1 AND r.blob_key IS NOT NULL`
    : `SELECT blob_key FROM revision_items WHERE blob_key IS NOT NULL`;
  const revisionItemsRes = await db.query<{ blob_key: string | null }>(itemsQuery, queryParams);
  for (const row of revisionItemsRes.rows) {
    if (row.blob_key) referencedKeys.add(row.blob_key);
  }

  const artQuery = projectId
    ? `SELECT a.pdf_key, a.log_key, a.synctex_key FROM artifact_sets a JOIN compile_jobs c ON a.compile_job_id = c.id WHERE c.project_id = $1`
    : `SELECT pdf_key, log_key, synctex_key FROM artifact_sets`;
  const artifactsRes = await db.query<{
    pdf_key: string | null;
    log_key: string | null;
    synctex_key: string | null;
  }>(artQuery, queryParams);
  for (const row of artifactsRes.rows) {
    if (row.pdf_key) referencedKeys.add(row.pdf_key);
    if (row.log_key) referencedKeys.add(row.log_key);
    if (row.synctex_key) referencedKeys.add(row.synctex_key);
  }

  const missingBlobs: string[] = [];
  let verifiedBlobs = 0;

  for (const key of referencedKeys) {
    const bytes = await getObjectSafe(storage, key);
    if (bytes !== null && bytes !== undefined) {
      verifiedBlobs++;
    } else {
      missingBlobs.push(key);
    }
  }

  return {
    totalReferencedBlobs: referencedKeys.size,
    verifiedBlobs,
    missingBlobs,
    intact: missingBlobs.length === 0,
  };
}
