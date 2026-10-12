import type { FastifyInstance } from "fastify";
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsQuerySchema,
  type ProjectView,
} from "@latex-collab/contracts";
import { DatabaseClient, ProjectRepository } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { requireSession, type ProjectAuthorization } from "../../plugins/require-session.js";
import { problem } from "../../plugins/errors.js";
import { createProject, validateProjectTitle } from "./create.js";
import { cloneProject } from "./clone.js";

function parseIfMatch(header: string | undefined): number {
  if (!header) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  const match = /^"([0-9]+)"$/.exec(header.trim());
  if (!match) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  return Number.parseInt(match[1]!, 10);
}

export function registerProjectRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
  },
): void {
  const repo = options.db ? new ProjectRepository(options.db) : undefined;
  const secureCookies = options.secureCookies ?? options.origin?.startsWith("https://") ?? false;

  // 1. GET /api/v1/projects - list projects
  app.get("/api/v1/projects", async (request, reply) => {
    try {
      if (!options.db || !repo) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const identity = await requireSession(
        options.db,
        request,
        options.origin,
        secureCookies,
        false,
      );
      const query = listProjectsQuerySchema.safeParse(request.query);
      if (!query.success) throw new AuthError(400, "VALIDATION_ERROR");

      const result = await repo.list(identity.userId, query.data);
      return result;
    } catch (error) {
      if (error instanceof AuthError) {
        return reply
          .code(error.status)
          .type("application/problem+json")
          .send(problem(error.status, error.code, request.id));
      }
      throw error;
    }
  });

  // 2. POST /api/v1/projects - create project
  app.post("/api/v1/projects", async (request, reply) => {
    try {
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const identity = await requireSession(
        options.db,
        request,
        options.origin,
        secureCookies,
        true,
      );
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

      const project = await createProject(options.db, identity.userId, parsed.data);
      return reply.code(201).send(project);
    } catch (error) {
      if (error instanceof AuthError) {
        return reply
          .code(error.status)
          .type("application/problem+json")
          .send(problem(error.status, error.code, request.id));
      }
      throw error;
    }
  });

  // 3. GET /api/v1/projects/:projectId - get project
  app.get(
    "/api/v1/projects/:projectId",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params as { projectId: string };
        const result = await options.db.query<{
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          main_file_id: string | null;
          compiler: ProjectView["compiler"];
          status: ProjectView["status"];
          current_revision: number;
          created_at: Date;
          updated_at: Date;
        }>(
          `SELECT id, owner_id, title, description, main_file_id, compiler, status, current_revision, created_at, updated_at
           FROM projects WHERE id = $1`,
          [projectId],
        );
        const row = result.rows[0];
        if (!row || row.status !== "active") throw new AuthError(404, "RESOURCE_NOT_FOUND");

        const view: ProjectView = {
          id: row.id,
          ownerId: row.owner_id,
          title: row.title,
          description: row.description,
          mainFileId: row.main_file_id,
          compiler: row.compiler,
          status: row.status,
          currentRevision: Number(row.current_revision),
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
        return view;
      } catch (error) {
        if (error instanceof AuthError) {
          return reply
            .code(error.status)
            .type("application/problem+json")
            .send(problem(error.status, error.code, request.id));
        }
        throw error;
      }
    },
  );

  // 4. PATCH /api/v1/projects/:projectId - update project
  app.patch(
    "/api/v1/projects/:projectId",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const auth = request.projectAuthorization as ProjectAuthorization;
        const { projectId } = request.params as { projectId: string };
        const ifMatch = parseIfMatch(request.headers["if-match"]);

        const parsed = updateProjectSchema.safeParse(request.body);
        if (!parsed.success || Object.keys(parsed.data).length === 0) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const currentRes = await options.db.query<{
          owner_id: string;
          current_revision: number;
          status: string;
        }>(`SELECT owner_id, current_revision, status FROM projects WHERE id = $1`, [projectId]);
        const current = currentRes.rows[0];
        if (!current) throw new AuthError(404, "RESOURCE_NOT_FOUND");

        if (Number(current.current_revision) !== ifMatch) {
          throw new AuthError(412, "PRECONDITION_FAILED");
        }

        if (parsed.data.status && parsed.data.status !== current.status) {
          if (auth.role !== "OWNER") {
            throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
          }
        }

        if (parsed.data.title !== undefined) {
          validateProjectTitle(parsed.data.title);
        }

        const updateRes = await options.db.query<{
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          main_file_id: string | null;
          compiler: ProjectView["compiler"];
          status: ProjectView["status"];
          current_revision: number;
          created_at: Date;
          updated_at: Date;
        }>(
          `UPDATE projects
           SET title = coalesce($1, title),
               description = CASE WHEN $2::boolean THEN $3 ELSE description END,
               compiler = coalesce($4, compiler),
               status = coalesce($5, status),
               updated_at = now()
           WHERE id = $6
           RETURNING id, owner_id, title, description, main_file_id, compiler, status, current_revision, created_at, updated_at`,
          [
            parsed.data.title ?? null,
            parsed.data.description !== undefined,
            parsed.data.description ?? null,
            parsed.data.compiler ?? null,
            parsed.data.status ?? null,
            projectId,
          ],
        );

        const row = updateRes.rows[0]!;
        const view: ProjectView = {
          id: row.id,
          ownerId: row.owner_id,
          title: row.title,
          description: row.description,
          mainFileId: row.main_file_id,
          compiler: row.compiler,
          status: row.status,
          currentRevision: Number(row.current_revision),
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
        return view;
      } catch (error) {
        if (error instanceof AuthError) {
          return reply
            .code(error.status)
            .type("application/problem+json")
            .send(problem(error.status, error.code, request.id));
        }
        throw error;
      }
    },
  );

  // 5. DELETE /api/v1/projects/:projectId - soft delete project
  app.delete(
    "/api/v1/projects/:projectId",
    { config: { projectAction: "DELETE" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params as { projectId: string };

        const ifMatchHeader = request.headers["if-match"];
        if (ifMatchHeader) {
          const ifMatch = parseIfMatch(ifMatchHeader);
          const currentRes = await options.db.query<{ current_revision: number }>(
            `SELECT current_revision FROM projects WHERE id = $1`,
            [projectId],
          );
          if (currentRes.rows[0] && Number(currentRes.rows[0].current_revision) !== ifMatch) {
            throw new AuthError(412, "PRECONDITION_FAILED");
          }
        }

        await options.db.query(
          `UPDATE projects SET status = 'trashed', updated_at = now() WHERE id = $1`,
          [projectId],
        );
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof AuthError) {
          return reply
            .code(error.status)
            .type("application/problem+json")
            .send(problem(error.status, error.code, request.id));
        }
        throw error;
      }
    },
  );

  // 6. POST /api/v1/projects/:projectId/clone - clone project
  app.post(
    "/api/v1/projects/:projectId/clone",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const auth = request.projectAuthorization as ProjectAuthorization;
        const { projectId } = request.params as { projectId: string };

        const idempotencyKey = request.headers["idempotency-key"];
        if (
          typeof idempotencyKey !== "string" ||
          idempotencyKey.length < 16 ||
          idempotencyKey.length > 128
        ) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const body = request.body as { title?: unknown } | undefined;
        let title: string | undefined;
        if (body && typeof body === "object" && body !== null) {
          if ("title" in body) {
            if (typeof body.title !== "string") {
              throw new AuthError(400, "VALIDATION_ERROR");
            }
            title = body.title;
          }
        }

        const cloned = await cloneProject(options.db, projectId, auth.userId, title);
        return reply.code(201).send(cloned);
      } catch (error) {
        if (error instanceof AuthError) {
          return reply
            .code(error.status)
            .type("application/problem+json")
            .send(problem(error.status, error.code, request.id));
        }
        throw error;
      }
    },
  );
}
