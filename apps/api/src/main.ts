import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { S3StorageAdapter } from "@latex-collab/storage";
import { createReadiness } from "./readiness.js";
import { createServer, safeLoggerOptions } from "./server.js";
import { createRedisAuthRateLimiter } from "./plugins/rate-limit.js";
import {
  createSmtpVerificationSender,
  createSmtpPasswordResetSender,
} from "./modules/auth/mail.js";
async function main() {
  const config = parseServerConfig(process.env);
  const probes = createReadiness(config);
  const db = new DatabaseClient(config.DATABASE_URL);
  const rateLimiter = await createRedisAuthRateLimiter(config.REDIS_URL);
  let storage: S3StorageAdapter | undefined;
  if (process.env.NODE_ENV !== "production") {
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
    rateLimiter,
    storage,
    sendVerification:
      config.SMTP_URL && config.EMAIL_FROM
        ? createSmtpVerificationSender(config.SMTP_URL, config.EMAIL_FROM, config.APP_ORIGIN)
        : undefined,
    sendPasswordReset:
      config.SMTP_URL && config.EMAIL_FROM
        ? createSmtpPasswordResetSender(config.SMTP_URL, config.EMAIL_FROM, config.APP_ORIGIN)
        : undefined,
    secureCookies: config.NODE_ENV === "production" || config.APP_ORIGIN.startsWith("https://"),
  });
  app.addHook("onClose", async () => {
    probes.close();
    await db.close();
    await rateLimiter.close();
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
