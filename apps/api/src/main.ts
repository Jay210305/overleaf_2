import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { S3StorageAdapter } from "@latex-collab/storage";
import { createReadiness } from "./readiness.js";
import { createServer, safeLoggerOptions } from "./server.js";
import { MemoryTicketStore } from "./modules/collab/ticket.js";
import { CollabServer } from "@latex-collab/collab";
import { createRedisAuthRateLimiter } from "./plugins/rate-limit.js";
import { createRedisCollabInvalidationPublisher } from "./modules/collab/invalidation.js";
import { githubAuthConfigFromEnv } from "./modules/integrations/github-auth.js";
import { processAvatarCleanup } from "./modules/account/avatar.js";
import {
  createSmtpVerificationSender,
  createSmtpPasswordResetSender,
  createSmtpProjectInvitationSender,
} from "./modules/auth/mail.js";
async function main() {
  const config = parseServerConfig(process.env);
  const probes = createReadiness(config);
  const db = new DatabaseClient(config.DATABASE_URL);
  const rateLimiter = await createRedisAuthRateLimiter(config.REDIS_URL);
  const collabInvalidation = await createRedisCollabInvalidationPublisher(config.REDIS_URL);
  const storage = new S3StorageAdapter({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  });
  const ticketStore = new MemoryTicketStore();
  const app = createServer({
    checkReadiness: probes.check,
    origin: config.APP_ORIGIN,
    logger: safeLoggerOptions(config.LOG_LEVEL),
    db,
    rateLimiter,
    collabInvalidation,
    storage,
    ticketStore,
    githubAuth: { config: githubAuthConfigFromEnv(process.env) },
    sendVerification:
      config.SMTP_URL && config.EMAIL_FROM
        ? createSmtpVerificationSender(config.SMTP_URL, config.EMAIL_FROM, config.APP_ORIGIN)
        : undefined,
    sendPasswordReset:
      config.SMTP_URL && config.EMAIL_FROM
        ? createSmtpPasswordResetSender(config.SMTP_URL, config.EMAIL_FROM, config.APP_ORIGIN)
        : undefined,
    sendProjectInvitation:
      config.SMTP_URL && config.EMAIL_FROM
        ? createSmtpProjectInvitationSender(config.SMTP_URL, config.EMAIL_FROM, config.APP_ORIGIN)
        : undefined,
    secureCookies: config.NODE_ENV === "production" || config.APP_ORIGIN.startsWith("https://"),
  });
  const collab = new CollabServer({
    server: app.server,
    db,
    ticketStore,
    allowedOrigin: config.APP_ORIGIN,
  });
  await collab.start();
  let cleanupRunning = false;
  const runAvatarCleanup = async () => {
    if (cleanupRunning) return;
    cleanupRunning = true;
    try {
      await processAvatarCleanup(db, storage);
    } catch {
      // A failed pass is retried on the next interval without exposing object keys.
    } finally {
      cleanupRunning = false;
    }
  };
  const cleanupTimer = setInterval(() => void runAvatarCleanup(), 60_000);
  cleanupTimer.unref();
  app.addHook("onClose", async () => {
    clearInterval(cleanupTimer);
    await collab.stop();
    probes.close();
    await db.close();
    await rateLimiter.close();
    await collabInvalidation.close();
  });
  const stop = () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await app.listen({ host: "0.0.0.0", port: config.PORT });
  void runAvatarCleanup();
}
main().catch(() => {
  console.error("API startup failed: check required configuration and service availability.");
  process.exitCode = 1;
});
