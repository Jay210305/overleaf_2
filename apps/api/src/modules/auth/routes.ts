import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { DatabaseClient } from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";
import { AuthError } from "./errors.js";
import { isOriginAllowed } from "@latex-collab/config/server";
import { registerPublicAccount, registerTrustedAccount, type SendVerification } from "./register.js";
import { verifyEmail } from "./verify-email.js";
import { requireAnonymousCsrf, requireExactOrigin } from "../../plugins/csrf.js";
import { requestPasswordReset, resetPassword, type SendPasswordReset } from "./password-reset.js";
import {
  expiredSessionCookie,
  login,
  logout,
  readSessionCookie,
  rotateSession,
  sessionCookie,
} from "./session.js";

const verifyRequest = z.strictObject({ token: z.string().min(32).max(256) });

export interface AuthRouteOptions {
  db?: DatabaseClient | undefined;
  origin?: string | readonly string[] | undefined;
  sendVerification?: SendVerification | undefined;
  sendPasswordReset?: SendPasswordReset | undefined;
  secureCookies?: boolean | undefined;
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

function allowMutation(
  request: FastifyRequest,
  origin: string | readonly string[] | undefined,
): boolean {
  const csrf = request.headers["x-csrf-token"];
  return (
    !!origin &&
    isOriginAllowed(request.headers.origin, origin) &&
    typeof csrf === "string" &&
    csrf.length >= 8 &&
    csrf.length <= 256
  );
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions): void {
  const primaryOrigin =
    typeof options.origin === "string"
      ? options.origin.split(",")[0]?.trim()
      : Array.isArray(options.origin)
        ? options.origin[0]
        : undefined;
  const secureCookies = options.secureCookies ?? primaryOrigin?.startsWith("https://") ?? false;
  app.post("/api/v1/auth/register", async (request, reply) => {
    if (!allowMutation(request, options.origin))
      return reject(reply, request, new AuthError(403, "CSRF_DENIED"));
    if (!options.db || !options.sendVerification)
      return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
    const invite = request.headers["x-registration-invite"];
    if (typeof invite === "string" && invite.length >= 32 && invite.length <= 256) {
      try {
        await registerTrustedAccount(
          options.db,
          request.body,
          invite,
          options.sendVerification,
          request.id,
        );
        return reply.code(202).send({ accepted: true });
      } catch (error) {
        if (error instanceof AuthError) return reject(reply, request, error);
        throw error;
      }
    }

    if (process.env.PUBLIC_SIGNUP_ENABLED === "true") {
      try {
        await registerPublicAccount(
          options.db,
          request.body,
          options.sendVerification,
          request.id,
        );
        return reply.code(202).send({ accepted: true });
      } catch (error) {
        if (error instanceof AuthError) return reject(reply, request, error);
        throw error;
      }
    }

    return reject(reply, request, new AuthError(403, "REGISTRATION_DENIED"));
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

  app.post("/api/v1/auth/login", async (request, reply) => {
    try {
      requireAnonymousCsrf(request, options.origin);
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const issued = await login(options.db, request.body, request.id);
      return reply
        .header("set-cookie", sessionCookie(issued.token, secureCookies, issued.expiresAt))
        .header("x-csrf-token", issued.csrf)
        .code(200)
        .send(issued.user);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.get("/api/v1/auth/session", async (request, reply) => {
    try {
      requireExactOrigin(request, options.origin);
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const token = readSessionCookie(request.headers.cookie, secureCookies);
      const issued = await rotateSession(options.db, token);
      return reply
        .header("set-cookie", sessionCookie(issued.token, secureCookies, issued.expiresAt))
        .header("x-csrf-token", issued.csrf)
        .code(200)
        .send(issued.user);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    try {
      requireExactOrigin(request, options.origin);
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const token = readSessionCookie(request.headers.cookie, secureCookies);
      await logout(options.db, token, request.headers["x-csrf-token"], request.id);
      return reply.header("set-cookie", expiredSessionCookie(secureCookies)).code(204).send();
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.post("/api/v1/auth/password/forgot", async (request, reply) => {
    try {
      requireAnonymousCsrf(request, options.origin);
      if (!options.db || !options.sendPasswordReset)
        throw new AuthError(503, "SERVICE_UNAVAILABLE");
      await requestPasswordReset(options.db, request.body, options.sendPasswordReset);
      return reply.code(202).send({ accepted: true });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.post("/api/v1/auth/password/reset", async (request, reply) => {
    try {
      requireAnonymousCsrf(request, options.origin);
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      await resetPassword(options.db, request.body, request.id);
      return reply.code(200).send({ accepted: true });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
