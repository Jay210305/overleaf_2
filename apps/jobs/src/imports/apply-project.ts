import { createHash } from "node:crypto";
import type { ImportJobView } from "@latex-collab/db/repositories/import-jobs";
import { maxFileBytes, type StorageAdapter } from "@latex-collab/storage";
import { ZipValidationError } from "./zip.js";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
