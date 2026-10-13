import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { S3StorageAdapter } from "@latex-collab/storage";
import { runStorageGc } from "./maintenance/storage-gc.js";

const intervalMs = 60 * 60_000;

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const projectOption = process.argv.find((value) => value.startsWith("--project-id="));
  const allowed = new Set(["--once"]);
  if (process.argv.slice(2).some((value) => !allowed.has(value) && value !== projectOption)) {
    throw new Error("Unknown jobs option");
  }
  const config = parseServerConfig(process.env);
  const db = new DatabaseClient(config.DATABASE_URL);
  const storage = new S3StorageAdapter({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  });
  const projectId = projectOption?.slice("--project-id=".length);
  if (projectOption && !projectId) throw new Error("Project ID must not be empty");
  let active = false;
  let stopping = false;
  const pass = async (): Promise<void> => {
    if (active || stopping) return;
    active = true;
    try {
      const result = await runStorageGc(db, storage, projectId ? { projectId } : {});
      console.info("Storage cleanup pass", result);
      if (result.failed > 0) process.exitCode = 1;
    } catch {
      console.error("Storage cleanup pass failed; check service availability.");
      process.exitCode = 1;
    } finally {
      active = false;
    }
  };
  try {
    if (once) {
      await pass();
      return;
    }
    await pass();
    const timer = setInterval(() => void pass(), intervalMs);
    await new Promise<void>((resolve) => {
      const stop = () => {
        stopping = true;
        clearInterval(timer);
        resolve();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
    while (active) await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    await db.close();
  }
}

main().catch(() => {
  console.error("Jobs startup failed: check required configuration and service availability.");
  process.exitCode = 1;
});
