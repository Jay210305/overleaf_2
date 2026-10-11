import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { DatabaseClient } from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";
import { AuthError } from "./errors.js";
import { registerTrustedAccount, type SendVerification } from "./register.js";
import { verifyEmail } from "./verify-email.js";

const verifyRequest = z.strictObject({ token: z.string().min(32).max(256) });

export interface AuthRouteOptions {
  db?: DatabaseClient | undefined;
  origin?: string | undefined;
  sendVerification?: SendVerification | undefined;
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

function allowMutation(request: FastifyRequest, origin: string | undefined): boolean {
  const csrf = request.headers["x-csrf-token"];
  return (
    !!origin &&
    request.headers.origin === origin &&
    typeof csrf === "string" &&
    csrf.length >= 8 &&
    csrf.length <= 256
  );
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  app.post("/api/v1/auth/register", async (request, reply) => {
    if (!allowMutation(request, options.origin))
      return reject(reply, request, new AuthError(403, "CSRF_DENIED"));
    if (!options.db || !options.sendVerification)
      return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
    const invite = request.headers["x-registration-invite"];
    if (typeof invite !== "string" || invite.length < 32 || invite.length > 256)
      return reject(reply, request, new AuthError(403, "REGISTRATION_DENIED"));
    try {
      await registerTrustedAccount(options.db, request.body, invite, options.sendVerification);
      return reply.code(202).send({ accepted: true });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.post("/api/v1/auth/verify-email", async (request, reply) => {
    if (!allowMutation(request, options.origin))
      return reject(reply, request, new AuthError(403, "CSRF_DENIED"));
    if (!options.db) return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
    const parsed = verifyRequest.safeParse(request.body);
    if (!parsed.success) return reject(reply, request, new AuthError(400, "VALIDATION_ERROR"));
    try {
      await verifyEmail(options.db, parsed.data.token);
      return reply.code(200).send({ accepted: true });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
