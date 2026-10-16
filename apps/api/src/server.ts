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
import type { CollabInvalidationPublisher } from "./modules/collab/invalidation.js";
import { registerProfileRoutes } from "./modules/account/profile.js";
import { registerPasswordChangeRoute } from "./modules/account/password-change.js";
import { registerDeleteAccountRoute } from "./modules/account/delete-account.js";
import { registerAvatarRoutes } from "./modules/account/avatar.js";
import { registerProjectRoutes } from "./modules/projects/routes.js";
import { registerProjectLifecycleRoutes } from "./modules/projects/lifecycle.js";
import { registerProjectSettingsRoutes } from "./modules/projects/settings.js";
import { registerProjectStatisticsRoutes } from "./modules/projects/statistics.js";
import { registerBulkProjectRoutes } from "./modules/projects/bulk.js";

import { registerOwnershipRoutes } from "./modules/projects/ownership.js";
import { registerTagRoutes } from "./modules/tags/routes.js";
import { registerTemplateRoutes } from "./modules/templates/routes.js";
import { registerTreeRoutes } from "./modules/files/tree.js";
import { registerFigurePreviewRoute } from "./modules/files/figure-preview.js";
import { registerBinaryDownloadRoutes } from "./modules/files/binary-download.js";
import { registerTextRoutes } from "./modules/text/routes.js";
import { registerCheckpointRoutes } from "./modules/history/checkpoint.js";
import { registerHistoryRoutes } from "./modules/history/routes.js";
import { registerRestoreRoutes } from "./modules/history/restore.js";
import { registerSuggestionRoutes } from "./modules/review/suggestions.js";
import { registerResolveRoutes } from "./modules/review/resolve.js";
import { registerUploadRoutes } from "./modules/uploads/routes.js";
import { registerImportRoutes } from "./modules/imports/routes.js";
import { registerCompilationRoutes } from "./modules/compilations/routes.js";
import { registerCollabTicketRoutes, type TicketStore } from "./modules/collab/ticket.js";
import {
  registerProjectInvitationRoutes,
  type SendProjectInvitation,
} from "./modules/sharing/invitations.js";
import { registerShareLinkRoutes } from "./modules/sharing/share-links.js";
import { registerProjectMemberRoutes } from "./modules/sharing/members.js";
import { registerCommentRoutes } from "./modules/comments/routes.js";
import { registerChatRoutes } from "./modules/chat/routes.js";
import { registerChatEvents } from "./modules/chat/events.js";
import { registerNotificationRoutes } from "./modules/notifications/mentions.js";
import { registerSynctexRoutes } from "./modules/synctex/routes.js";
import { registerSearchRoutes } from "./modules/search/routes.js";

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
  "POST /api/v1/projects/:projectId/invitations",
  "POST /api/v1/invitations/accept",
  "POST /api/v1/invitations/reject",
  "POST /api/v1/projects/:projectId/share-links",
  "POST /api/v1/share-links/redeem",
]);

export interface ServerOptions {
  checkReadiness: () => Promise<boolean>;
  logger?: FastifyServerOptions["logger"];
  origin?: string;
  db?: DatabaseClient | undefined;
  storage?: StorageAdapter | undefined;
  sendVerification?: SendVerification | undefined;
  sendPasswordReset?: SendPasswordReset | undefined;
  sendProjectInvitation?: SendProjectInvitation | undefined;
  secureCookies?: boolean | undefined;
  rateLimiter?: AuthRateLimiter | undefined;
  ticketStore?: TicketStore | undefined;
  collabInvalidation?: CollabInvalidationPublisher | undefined;
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
  registerDeleteAccountRoute(app, {
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
    registerProjectLifecycleRoutes(app, {
      db: options.db,
    });
    registerBulkProjectRoutes(app, {
      db: options.db,
    });
    registerOwnershipRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerProjectSettingsRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerProjectStatisticsRoutes(app, {
      db: options.db,
    });

    registerTagRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerTreeRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerFigurePreviewRoute(app, { db: options.db, storage: options.storage });
    registerBinaryDownloadRoutes(app, { db: options.db, storage: options.storage });
    registerTemplateRoutes(app, { db: options.db });
    registerTextRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerCheckpointRoutes(app, {
      db: options.db,
    });
    registerHistoryRoutes(app, {
      db: options.db,
    });
    registerRestoreRoutes(app, {
      db: options.db,
    });
    registerSuggestionRoutes(app, {
      db: options.db,
    });
    registerResolveRoutes(app, {
      db: options.db,
    });
    registerUploadRoutes(app, { db: options.db, storage: options.storage });
    registerImportRoutes(app, { db: options.db, storage: options.storage });
    registerCompilationRoutes(app, {
      db: options.db,
      storage: options.storage,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    });
    registerCollabTicketRoutes(app, {
      db: options.db,
      ticketStore: options.ticketStore,
    });
    registerProjectInvitationRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
      sendProjectInvitation: options.sendProjectInvitation,
    });
    registerShareLinkRoutes(app, {
      db: options.db,
      origin: options.origin,
      secureCookies: options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
      collabInvalidation: options.collabInvalidation,
    });
    registerProjectMemberRoutes(app, {
      db: options.db,
      collabInvalidation: options.collabInvalidation,
    });
    registerCommentRoutes(app, options.db);
    registerChatRoutes(app, options.db);
    registerNotificationRoutes(
      app,
      options.db,
      options.origin,
      options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    );
    registerChatEvents(
      app,
      options.db,
      options.origin,
      options.secureCookies ?? options.origin?.startsWith("https://") ?? false,
    );
    registerSynctexRoutes(app, {
      db: options.db,
      storage: options.storage,
    });
    registerSearchRoutes(app, {
      db: options.db,
      storage: options.storage,
    });
  }
  return app;
}
