import type { FastifyInstance, FastifyRequest } from "fastify";
import { allowsProjectAction, isProjectAction, type ProjectAction } from "@latex-collab/auth";
import { isUUID, type DatabaseClient } from "@latex-collab/db";
import type { Role } from "@latex-collab/contracts";
import { AuthError, tokenHash } from "../modules/auth/errors.js";
import { readSessionCookie } from "../modules/auth/session.js";
import { requireExactOrigin, requireSessionCsrf } from "./csrf.js";
import { problem } from "./errors.js";

const absoluteMs = 30 * 24 * 60 * 60 * 1000;

export interface SessionIdentity {
  userId: string;
  sessionId: string;
}

export interface ProjectAuthorization extends SessionIdentity {
  projectId: string;
  role: Role;
  action: ProjectAction;
}

declare module "fastify" {
  interface FastifyRequest {
    projectAuthorization?: ProjectAuthorization;
    sessionIdentity?: SessionIdentity;
  }
}

export async function requireSession(
  db: DatabaseClient,
  request: FastifyRequest,
  origin: string | undefined,
  secureCookies: boolean,
  mutation = false,
): Promise<SessionIdentity> {
  requireExactOrigin(request, origin);
  const token = readSessionCookie(request.headers.cookie, secureCookies);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  const found = await db.query<{
    session_id: string;
    user_id: string;
    csrf_hash: string | null;
    expires_at: Date;
    session_created_at: Date;
    revoked_at: Date | null;
    disabled_at: Date | null;
    email_verified_at: Date | null;
  }>(
    `SELECT s.id AS session_id, s.user_id, s.csrf_hash, s.expires_at,
            s.created_at AS session_created_at, s.revoked_at,
            u.disabled_at, u.email_verified_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
    [tokenHash(token)],
  );
  const row = found.rows[0];
  if (
    !row ||
    !row.csrf_hash ||
    row.revoked_at ||
    row.expires_at.getTime() <= Date.now() ||
    row.session_created_at.getTime() + absoluteMs <= Date.now()
  )
    throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  if (row.disabled_at) throw new AuthError(403, "ACCOUNT_DISABLED");
  if (!row.email_verified_at) throw new AuthError(403, "EMAIL_NOT_VERIFIED");
  if (mutation) requireSessionCsrf(request.headers["x-csrf-token"], row.csrf_hash);
  return { userId: row.user_id, sessionId: row.session_id };
}

export async function requireProjectAction(
  db: DatabaseClient,
  request: FastifyRequest,
  origin: string | undefined,
  secureCookies: boolean,
  action: unknown,
): Promise<ProjectAuthorization> {
  const identity = await requireSession(
    db,
    request,
    origin,
    secureCookies,
    request.method !== "GET",
  );
  if (!isProjectAction(action)) throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
  const projectId = (request.params as { projectId?: unknown } | undefined)?.projectId;
  if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");
  const found = await db.query<{
    owner_id: string;
    status: string;
    role: Role | null;
    revoked_at: Date | null;
  }>(
    `SELECT p.owner_id, p.status, pm.role, pm.revoked_at
     FROM projects p LEFT JOIN active_project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     WHERE p.id = $1`,
    [projectId, identity.userId],
  );
  const project = found.rows[0];
  if (!project) throw new AuthError(404, "RESOURCE_NOT_FOUND");
  const role: Role | null =
    project.owner_id === identity.userId ? "OWNER" : project.revoked_at ? null : project.role;
  if (!role) throw new AuthError(404, "RESOURCE_NOT_FOUND");
  if (project.status !== "active" && action !== "RESTORE" && action !== "DELETE")
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  if (!allowsProjectAction(role, action)) throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
  return { ...identity, projectId, role, action };
}

export function installProjectGuard(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined; origin?: string | undefined; secureCookies: boolean },
): void {
  app.decorateRequest("projectAuthorization", undefined);
  app.decorateRequest("sessionIdentity", undefined);
  app.addHook("preHandler", async (request, reply) => {
    // Session-scoped non-project routes (templates catalogue) share the
    // session guard; project routes keep the project authorization path.
    // Every route under these prefixes must declare sessionOnly or a
    // projectAction, otherwise the guard denies it.
    if (
      !request.url.startsWith("/api/v1/projects/") &&
      !request.url.startsWith("/api/v1/templates")
    )
      return;
    try {
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const config = request.routeOptions.config as
        { projectAction?: unknown; sessionOnly?: unknown } | undefined;
      if (config?.sessionOnly === true) {
        request.sessionIdentity = await requireSession(
          options.db,
          request,
          options.origin,
          options.secureCookies,
          request.method !== "GET",
        );
        return;
      }
      const action = config?.projectAction;
      request.projectAuthorization = await requireProjectAction(
        options.db,
        request,
        options.origin,
        options.secureCookies,
        action,
      );
    } catch (error) {
      if (error instanceof AuthError)
        return reply
          .code(error.status)
          .type("application/problem+json")
          .send(problem(error.status, error.code, request.id));
      throw error;
    }
  });
}
