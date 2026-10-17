import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseClient } from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";
import { requireSession } from "../../plugins/require-session.js";

export interface AdminQuotas {
  maxConcurrentCompilationsPerProject: number;
  maxProjectSizeBytes: number;
  maxDailyCompilationsPerUser: number;
}

export interface AdminFeatureFlags {
  publicSignupEnabled: boolean;
  untrustedCompileEnabled: boolean;
  gitBridgeEnabled: boolean;
  templatesGalleryEnabled: boolean;
}

let activeQuotas: AdminQuotas = {
  maxConcurrentCompilationsPerProject: 2,
  maxProjectSizeBytes: 50 * 1024 * 1024, // 50MB
  maxDailyCompilationsPerUser: 100,
};

let activeFlags: AdminFeatureFlags = {
  publicSignupEnabled: false,
  untrustedCompileEnabled: false,
  gitBridgeEnabled: true,
  templatesGalleryEnabled: true,
};

export function getAdminQuotas(): AdminQuotas {
  return { ...activeQuotas };
}

export function getAdminFlags(): AdminFeatureFlags {
  return { ...activeFlags };
}

export function registerAdminRoutes(
  app: FastifyInstance,
  options: {
    db: DatabaseClient;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
    adminUserIds?: Set<string>;
    adminEmails?: Set<string>;
  },
): void {
  const { db, origin, secureCookies = false } = options;
  const adminEmails = options.adminEmails ?? new Set(["admin@example.com", "admin@overleaf.local"]);

  async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    const isMutation = request.method !== "GET" && request.method !== "HEAD";
    const session = await requireSession(db, request, origin, secureCookies, isMutation);

    // Verify admin role / email
    const userRes = await db.query<{ id: string; email_normalized: string }>(
      "SELECT id, email_normalized FROM users WHERE id = $1",
      [session.userId],
    );

    const user = userRes.rows[0];
    const isAdmin =
      (user && adminEmails.has(user.email_normalized)) ||
      (options.adminUserIds && options.adminUserIds.has(session.userId));

    if (!isAdmin) {
      reply.code(403).type("application/problem+json").send(problem(403, "FORBIDDEN", request.id));
      return;
    }
  }

  // GET /api/v1/admin/users
  app.get("/api/v1/admin/users", { preHandler: requireAdmin }, async () => {
    const res = await db.query<{
      id: string;
      email_normalized: string;
      display_name: string;
      disabled_at: string | null;
      created_at: string;
    }>("SELECT id, email_normalized, display_name, disabled_at, created_at FROM users ORDER BY created_at DESC LIMIT 50");
    return { users: res.rows };
  });

  // PATCH /api/v1/admin/users/:userId/disable
  app.patch<{ Params: { userId: string }; Body: { disabled: boolean } }>(
    "/api/v1/admin/users/:userId/disable",
    { preHandler: requireAdmin },
    async (request) => {
      const { userId } = request.params;
      const { disabled } = request.body;
      const disabledAt = disabled ? new Date() : null;

      await db.query("UPDATE users SET disabled_at = $1 WHERE id = $2", [disabledAt, userId]);
      return { success: true, userId, disabled };
    },
  );

  // GET /api/v1/admin/quotas
  app.get("/api/v1/admin/quotas", { preHandler: requireAdmin }, async () => {
    return { quotas: getAdminQuotas() };
  });

  // PATCH /api/v1/admin/quotas
  app.patch<{ Body: Partial<AdminQuotas> }>(
    "/api/v1/admin/quotas",
    { preHandler: requireAdmin },
    async (request) => {
      activeQuotas = { ...activeQuotas, ...request.body };
      return { quotas: getAdminQuotas() };
    },
  );

  // GET /api/v1/admin/flags
  app.get("/api/v1/admin/flags", { preHandler: requireAdmin }, async () => {
    return { flags: getAdminFlags() };
  });

  // PATCH /api/v1/admin/flags
  app.patch<{ Body: Partial<AdminFeatureFlags> }>(
    "/api/v1/admin/flags",
    { preHandler: requireAdmin },
    async (request, reply) => {
      if (request.body.untrustedCompileEnabled && !process.env.G5_ISOLATION_VERIFIED) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(
            problem(
              400,
              "ISOLATION_REQUIRED",
              request.id,
            ),
          );
      }
      activeFlags = { ...activeFlags, ...request.body };
      return { flags: getAdminFlags() };
    },
  );

  // GET /api/v1/admin/jobs
  app.get("/api/v1/admin/jobs", { preHandler: requireAdmin }, async () => {
    const res = await db.query<{
      id: string;
      project_id: string;
      status: string;
      compiler: string;
      requested_at: string;
    }>(
      `SELECT id, project_id, status, compiler, requested_at
       FROM compile_jobs
       ORDER BY requested_at DESC LIMIT 50`,
    );
    return { jobs: res.rows };
  });
}
