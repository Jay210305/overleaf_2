import { pathToFileURL } from "node:url";
import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";
import { runImportApplyPass } from "./apply-project.js";

export type ImportApplyCliOptions = {
  limit?: number | undefined;
};

/**
 * Private apply pass over durable validated import jobs. Applies each job
 * to one consistent project and sweeps expired server-only archives.
 * It never exposes object keys and never deletes project blobs.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const limitArg = args.find((value) => value.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 5;
  if (!once || args.some((value) => value !== "--once" && value !== limitArg)) {
    throw new Error("Usage: apply.ts --once [--limit=N]");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Import apply limit must be an integer between 1 and 100");
  }
  const { parseServerConfig } = await import("@latex-collab/config/server");
  const { DatabaseClient } = await import("@latex-collab/db");
  const { S3StorageAdapter } = await import("@latex-collab/storage");
  const config = parseServerConfig(process.env);
  const db: DatabaseClient = new DatabaseClient(config.DATABASE_URL);
  const storage: StorageAdapter = new S3StorageAdapter({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  });
  try {
    const result = await runImportApplyPass(db, storage, { limit });
    console.info("Import apply pass", result);
  } finally {
    await db.close();
  }
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invoked !== null && import.meta.url === invoked) {
  main().catch(() => {
    console.error("Import apply pass failed: check service availability.");
    process.exitCode = 1;
  });
}
