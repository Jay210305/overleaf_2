import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { DatabaseClient } from "@latex-collab/db";
import {
  ImportJobRepository,
  type ImportJobErrorCode,
} from "@latex-collab/db/repositories/import-jobs";
import {
  maxArchiveBytes,
  assertImportKeyScope,
  StorageLimitError,
  type StorageAdapter,
} from "@latex-collab/storage";
import { validateZipArchive, ZipValidationError } from "./zip.js";

export type ImportValidationOptions = {
  now?: Date | undefined;
  leaseMs?: number | undefined;
  limit?: number | undefined;
  sweepLimit?: number | undefined;
};

export type ImportValidationResult = {
  claimed: number;
  validated: number;
  failed: number;
  swept: number;
  released: number;
};

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Private validation pass over durable import jobs. Claims queued or
 * lease-expired rows, re-verifies the database-bound archive bytes, and
 * transitions queued → validating → validated/failed. It writes no
 * project, node or text rows. Rejected archives are deleted best-effort;
 * a later pass sweeps failed jobs whose bytes still exist.
 */
export async function runImportValidationPass(
  db: DatabaseClient,
  storage: StorageAdapter,
  options: ImportValidationOptions = {},
): Promise<ImportValidationResult> {
  const now = options.now ?? new Date();
  const leaseMs = options.leaseMs ?? 5 * 60_000;
  const limit = options.limit ?? 5;
  const sweepLimit = options.sweepLimit ?? 25;
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(sweepLimit) ||
    sweepLimit < 1 ||
    sweepLimit > 100
  ) {
    throw new Error("Invalid import validation options");
  }
  const jobs = new ImportJobRepository(db);
  const result: ImportValidationResult = {
    claimed: 0,
    validated: 0,
    failed: 0,
    swept: 0,
    released: 0,
  };
  for (let claimed = 0; claimed < limit; claimed++) {
    const job = await jobs.claimNext({ now, leaseMs });
    if (!job) break;
    result.claimed += 1;
    assertImportKeyScope(job.archiveKey, job.actorId);
    let failure: ImportJobErrorCode | null = null;
    try {
      const head = await storage.head(job.archiveKey);
      if (!head || head.sizeBytes !== job.archiveSize || head.sizeBytes > maxArchiveBytes) {
        failure = head && head.sizeBytes > maxArchiveBytes ? "LIMIT_EXCEEDED" : "INVALID_ARCHIVE";
      } else {
        let bytes: Uint8Array;
        try {
          bytes = await storage.getLimited(job.archiveKey, maxArchiveBytes);
        } catch (error) {
          if (error instanceof StorageLimitError) failure = "LIMIT_EXCEEDED";
          throw error;
        }
        if (failure === null) {
          if (bytes.length !== job.archiveSize || digest(bytes) !== job.archiveSha256) {
            failure = "INVALID_ARCHIVE";
          } else {
            try {
              const manifest = await validateZipArchive(bytes);
              await jobs.complete(job.id, manifest);
              result.validated += 1;
              continue;
            } catch (error) {
              if (error instanceof ZipValidationError) {
                failure = error.code;
              } else {
                throw error;
              }
            }
          }
        }
      }
    } catch {
      if (failure === null) {
        await jobs.release(job.id, now);
        result.released += 1;
        continue;
      }
    }
    if (failure !== null) {
      await jobs.fail(job.id, failure);
      result.failed += 1;
      try {
        await storage.delete(job.archiveKey);
        await jobs.markArchiveSwept(job.id);
        result.swept += 1;
      } catch {
        // The failed row stays unswept; a later pass retries the bytes.
      }
    }
  }
  const pending = await jobs.listUnswept(sweepLimit);
  for (const job of pending) {
    try {
      assertImportKeyScope(job.archiveKey, job.actorId);
      if (await storage.head(job.archiveKey)) {
        await storage.delete(job.archiveKey);
      }
      await jobs.markArchiveSwept(job.id);
      result.swept += 1;
    } catch {
      // Retryable on a later pass. No key or source is logged.
    }
  }
  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const limitArg = args.find((value) => value.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 5;
  if (!once || args.some((value) => value !== "--once" && value !== limitArg)) {
    throw new Error("Usage: worker.ts --once [--limit=N]");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Import validation limit must be an integer between 1 and 100");
  }
  const { parseServerConfig } = await import("@latex-collab/config/server");
  const { DatabaseClient } = await import("@latex-collab/db");
  const { S3StorageAdapter } = await import("@latex-collab/storage");
  const config = parseServerConfig(process.env);
  const db = new DatabaseClient(config.DATABASE_URL);
  const storage = new S3StorageAdapter({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  });
  try {
    const result = await runImportValidationPass(db, storage, { limit });
    console.info("Import validation pass", result);
  } finally {
    await db.close();
  }
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invoked !== null && import.meta.url === invoked) {
  main().catch(() => {
    console.error("Import validation pass failed: check service availability.");
    process.exitCode = 1;
  });
}
