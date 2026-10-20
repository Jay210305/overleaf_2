import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { S3StorageAdapter } from "@latex-collab/storage";
import { runImportApplyPass } from "./imports/apply-project.js";
import { runStorageGc } from "./maintenance/storage-gc.js";
import { CompilationWorker } from "./compilation/worker.js";
import { TrustedWorkerExecutor } from "./compilation/trusted-worker-executor.js";
import { createRevisionSourceLoader } from "./compilation/source-loader.js";

const gcIntervalMs = 60 * 60_000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

async function main(): Promise<void> {
  const applyImports = process.argv[2] === "imports:apply";
  const once = process.argv.includes("--once");
  const projectOption = process.argv.find((value) => value.startsWith("--project-id="));
  const actorOption = process.argv.find((value) => value.startsWith("--actor-id="));
  const allowed = new Set(["--once", ...(applyImports ? ["imports:apply"] : [])]);
  if (
    process.argv
      .slice(2)
      .some((value) => !allowed.has(value) && value !== projectOption && value !== actorOption)
  ) {
    throw new Error("Unknown jobs option");
  }
  if (applyImports && (!once || projectOption || actorOption)) {
    throw new Error("Usage: imports:apply --once");
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
  const compileEnabled = process.env.COMPILE_ENABLED !== "false";
  const compilePollMs = parsePositiveInt(process.env.COMPILE_POLL_MS, 5_000);
  const compileLimit = parsePositiveInt(process.env.COMPILE_LIMIT, 5);
  const compileLeaseMs = parsePositiveInt(process.env.COMPILE_LEASE_MS, 5 * 60_000);
  const sourceLoader = createRevisionSourceLoader(db, storage);
  const executor = new TrustedWorkerExecutor({ sourceLoader });
  const compileWorker = new CompilationWorker(db, executor, storage);
  const projectId = projectOption?.slice("--project-id=".length);
  if (projectOption && !projectId) throw new Error("Project ID must not be empty");
  const actorId = actorOption?.slice("--actor-id=".length);
  if (actorOption && !actorId) throw new Error("Actor ID must not be empty");
  let active = false;
  let stopping = false;

  const runCompilePass = async (): Promise<void> => {
    if (!compileEnabled || stopping) return;
    try {
      const result = await compileWorker.runPass({
        limit: compileLimit,
        leaseMs: compileLeaseMs,
        executor,
        storage,
      });
      if (result.claimed > 0 || result.recovered > 0) {
        console.info("Compilation pass", result);
      }
    } catch {
      console.error("Compilation pass failed; check service availability.");
    }
  };

  const runGcPass = async (): Promise<void> => {
    if (stopping) return;
    try {
      const result = await runStorageGc(
        db,
        storage,
        projectId ? { projectId } : actorId ? { actorId } : {},
      );
      console.info("Storage cleanup pass", result);
      if (result.failed > 0) process.exitCode = 1;
    } catch {
      console.error("Storage cleanup pass failed; check service availability.");
      process.exitCode = 1;
    }
  };

  const pass = async (): Promise<void> => {
    if (active || stopping) return;
    active = true;
    try {
      if (applyImports) {
        const result = await runImportApplyPass(db, storage);
        console.info("Import apply pass", result);
        if (result.retried > 0) process.exitCode = 1;
        return;
      }
      await runCompilePass();
      await runGcPass();
    } finally {
      active = false;
    }
  };
  try {
    if (once) {
      await pass();
      return;
    }
    if (applyImports) {
      await pass();
      return;
    }
    await runGcPass();
    await runCompilePass();
    let lastGcAt = Date.now();
    const timer = setInterval(() => {
      if (stopping) return;
      if (Date.now() - lastGcAt >= gcIntervalMs) {
        lastGcAt = Date.now();
        void runGcPass();
      }
      void (async () => {
        if (active) return;
        active = true;
        try {
          await runCompilePass();
        } finally {
          active = false;
        }
      })();
    }, compilePollMs);
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
