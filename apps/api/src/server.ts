import { randomUUID } from "node:crypto";
import Fastify, { type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import { healthSchema } from "@latex-collab/contracts";
import { registerErrors, problem } from "./plugins/errors.js";
import { registerDevelopmentSampleRoute } from "./modules/development/sample.js";
import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import type { SendVerification } from "./modules/auth/register.js";
import type { SendPasswordReset } from "./modules/auth/password-reset.js";
import { installProjectGuard } from "./plugins/require-session.js";
import { safeLoggerOptions } from "./plugins/logging.js";
import type { AuthRateLimiter } from "./plugins/rate-limit.js";
import { registerProfileRoutes } from "./modules/account/profile.js";
import { registerPasswordChangeRoute } from "./modules/account/password-change.js";
import { registerAvatarRoutes } from "./modules/account/avatar.js";
import { registerProjectRoutes } from "./modules/projects/routes.js";
import { registerProjectSettingsRoutes } from "./modules/projects/settings.js";
import { registerTreeRoutes } from "./modules/files/tree.js";
import { registerTextRoutes } from "./modules/text/routes.js";
import { registerCheckpointRoutes } from "./modules/history/checkpoint.js";
import { registerUploadRoutes } from "./modules/uploads/routes.js";
import { registerImportRoutes } from "./modules/imports/routes.js";

export { safeLoggerOptions } from "./plugins/logging.js";

const authScopes = new Set([
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/verify-email",
  "POST /api/v1/auth/login",
  "GET /api/v1/auth/session",
  "POST /api/v1/auth/logout",
  "POST /api/v1/auth/password/forgot",
  "POST /api/v1/auth/password/reset",
  "GET /api/v1/me",
  "PATCH /api/v1/me",
  "GET /api/v1/me/preferences",
  "PATCH /api/v1/me/preferences",
  "GET /api/v1/me/sessions",
  "GET /api/v1/me/sessions/:sessionId",
  "DELETE /api/v1/me/sessions/:sessionId",
  "POST /api/v1/me/password",
  "POST /api/v1/me/avatar",
  "GET /api/v1/me/avatar/content",
]);

export interface ServerOptions {
  checkReadiness: () => Promise<boolean>;
  logger?: FastifyServerOptions["logger"];
  origin?: string;
  db?: DatabaseClient | undefined;
  storage?: StorageAdapter | undefined;
  sendVerification?: SendVerification | undefined;
  sendPasswordReset?: SendPasswordReset | undefined;
  secureCookies?: boolean | undefined;
  rateLimiter?: AuthRateLimiter | undefined;
}
export function createServer(options: ServerOptions) {
  const app = Fastify({
    logger: options.logger ?? safeLoggerOptions(),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    bodyLimit: 1048576,
    requestTimeout: 5000,
  });
  registerErrors(app);
  if (options.origin)
    void app.register(cors, {
      origin: options.origin,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: [
        "content-type",
        "x-csrf-token",
        "x-registration-invite",
        "if-match",
        "idempotency-key",
      ],
      exposedHeaders: ["x-csrf-token", "x-request-id", "retry-after", "etag"],
    });
  app.addHook("onRequest", async (request, reply) => {
    const scope = `${request.method} ${request.routeOptions.url ?? ""}`;
    if (!options.rateLimiter || !authScopes.has(scope)) return;
    try {
      const result = await options.rateLimiter.consume(request.ip, scope);
      if (!result.allowed)
        return reply
          .header("retry-after", String(Math.max(1, result.retryAfterSeconds)))
          .code(429)
          .type("application/problem+json")
          .send(problem(429, "RATE_LIMITED", request.id));
    } catch {
      return reply
        .code(503)
        .type("application/problem+json")
        .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
    }
  });
  app.addHook("onSend", async (request, reply) => {
    reply
      .header("x-request-id", request.id)
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff");
  });
  installProjectGuard(app, {
    db: options.db,
    origin: options.origin,
    secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
  });
  app.get("/api/v1/health/live", async (request) =>
    healthSchema.parse({ status: "live", requestId: request.id }),
  );
  app.get("/api/v1/health/ready", async (request, reply) => {
    let ready = false;
    try {
      ready = await options.checkReadiness();
    } catch {
      /* Dependency failure is deliberately redacted. */
    }
    if (!ready)
      return reply
        .code(503)
        .type("application/problem+json")
        .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
    return healthSchema.parse({ status: "ready", requestId: request.id });
  });
  registerDevelopmentSampleRoute(app, { db: options.db, storage: options.storage });
  registerAuthRoutes(app, {
    db: options.db,
    origin: options.origin,
    sendVerification: options.sendVerification,
    sendPasswordReset: options.sendPasswordReset,
    secureCookies: options.secureCookies,
  });
  registerProfileRoutes(app, {
    db: options.db,
    origin: options.origin,
    secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
  });
  registerPasswordChangeRoute(app, {
    db: options.db,
    origin: options.origin,
    secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
  });
  registerAvatarRoutes(app, {
    db: options.db,
    storage: options.storage,
    origin: options.origin,
    secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
  });
  if (options.db) {
    registerProjectRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerProjectSettingsRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerTreeRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerTextRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerCheckpointRoutes(app, {
      db: options.db,
    });
    registerUploadRoutes(app, { db: options.db, storage: options.storage });
    registerImportRoutes(app, { db: options.db, storage: options.storage });
  }
  return app;
}
