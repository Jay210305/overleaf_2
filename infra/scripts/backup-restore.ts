/**
 * Automated Complete Backup and Restore Utility (S15-T06, NFR-09)
 * Orchestrates atomic snapshot and recovery of database tables and MinIO/S3 object storage blobs.
 */

import {
  createTrustedBackup,
  restoreTrustedBackup,
  verifyBackupIntegrity,
  type BackupManifest,
  type BackupResult,
  type VerificationResult,
} from "./trusted-backup.js";
import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";

export {
  createTrustedBackup,
  restoreTrustedBackup,
  verifyBackupIntegrity,
  type BackupManifest,
  type BackupResult,
  type VerificationResult,
};

export interface BackupOptions {
  db: DatabaseClient;
  storage: StorageAdapter;
  outputDir: string;
  projectId?: string;
}

export interface RestoreOptions {
  db: DatabaseClient;
  storage: StorageAdapter;
  backupDir: string;
  projectId?: string;
}

/**
 * Automates complete disaster recovery restore:
 * 1. Restores all referenced blobs from backup bundle into storage.
 * 2. Verifies integrity of all referenced hashes.
 * 3. Asserts session and permission policy coherence.
 */
export async function executeAutomatedRestore(options: RestoreOptions): Promise<{
  success: boolean;
  verification: VerificationResult;
  restoredAt: string;
}> {
  const verification = await restoreTrustedBackup(options);

  if (!verification.intact) {
    throw new Error(
      `Disaster recovery integrity check failed: ${verification.missingBlobs.length} blobs missing: ${verification.missingBlobs.join(", ")}`,
    );
  }

  return {
    success: true,
    verification,
    restoredAt: new Date().toISOString(),
  };
}
