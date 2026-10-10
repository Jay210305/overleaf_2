import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { S3StorageAdapter } from "@latex-collab/storage";
import { createReadiness } from "./readiness.js";
import { createServer, safeLoggerOptions } from "./server.js";
async function main() {
  const config = parseServerConfig(process.env);
  const probes = createReadiness(config);
  let db: DatabaseClient | undefined;
  let storage: S3StorageAdapter | undefined;
  if (process.env.NODE_ENV !== "production") {
    db = new DatabaseClient(config.DATABASE_URL);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  }
  const app = createServer({
    checkReadiness: probes.check,
    origin: config.APP_ORIGIN,
    logger: safeLoggerOptions(config.LOG_LEVEL),
    db,
    storage,
  });
  app.addHook("onClose", async () => {
    probes.close();
    if (db) await db.close();
  });
  const stop = () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await app.listen({ host: "0.0.0.0", port: config.PORT });
}
main().catch(() => {
  console.error("API startup failed: check required configuration and service availability.");
  process.exitCode = 1;
});
