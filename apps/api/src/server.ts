import { randomUUID } from "node:crypto";
import Fastify, { type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import { healthSchema } from "@latex-collab/contracts";
import { registerErrors, problem } from "./plugins/errors.js";
import { registerDevelopmentSampleRoute } from "./modules/development/sample.js";
import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";

export interface ServerOptions {
  checkReadiness: () => Promise<boolean>;
  logger?: FastifyServerOptions["logger"];
  origin?: string;
  db?: DatabaseClient | undefined;
  storage?: StorageAdapter | undefined;
}
export function safeLoggerOptions(level = "info") {
  return {
    level,
    serializers: {
      req: (req: { method: string }) => ({ method: req.method }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    redact: ["req.headers.authorization", "req.headers.cookie", "password", "token"],
  };
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
    void app.register(cors, { origin: options.origin, credentials: false, methods: ["GET"] });
  app.addHook("onSend", async (request, reply) => {
    reply
      .header("x-request-id", request.id)
      .header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff");
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
  return app;
}
