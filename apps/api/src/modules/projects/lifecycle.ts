import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ProjectView } from "@latex-collab/contracts";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

export const permanentDeleteSchema = z
  .object({
    confirmTitle: z.string().min(1).optional(),
  })
  .strict();

export type PermanentDeleteInput = z.infer<typeof permanentDeleteSchema>;

function handleLifecycleError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  throw error;
}

export class ProjectLifecycleService {
  constructor(private readonly db: DatabaseClient) {}

  async archive(projectId: string, actorId: string): Promise<ProjectView> {
    const res = await this.db.query<{
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
       SET status = 'archived', updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND status = 'active'
       RETURNING id, owner_id, title, description, main_file_id, compiler, status, current_revision, created_at, updated_at`,
      [projectId, actorId],
    );

    const row = res.rows[0];
    if (!row) {
      // Check if project exists
      const check = await this.db.query<{ status: string }>(
        `SELECT status FROM projects WHERE id = $1`,
        [projectId],
      );
      if (check.rows.length === 0) throw new AuthError(404, "RESOURCE_NOT_FOUND");
      throw new AuthError(409, "INVALID_PROJECT_STATE");
    }

    return {
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
  }

  async unarchive(projectId: string, actorId: string): Promise<ProjectView> {
    const res = await this.db.query<{
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
       SET status = 'active', updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND status = 'archived'
       RETURNING id, owner_id, title, description, main_file_id, compiler, status, current_revision, created_at, updated_at`,
      [projectId, actorId],
    );

    const row = res.rows[0];
    if (!row) {
      const check = await this.db.query<{ status: string }>(
        `SELECT status FROM projects WHERE id = $1`,
        [projectId],
      );
      if (check.rows.length === 0) throw new AuthError(404, "RESOURCE_NOT_FOUND");
      throw new AuthError(409, "INVALID_PROJECT_STATE");
    }

    return {
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
  }

  async trash(projectId: string, actorId: string): Promise<void> {
    const res = await this.db.query(
      `UPDATE projects
       SET status = 'trashed', updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND status != 'trashed'`,
      [projectId, actorId],
    );
    if (res.rowCount === 0) {
      const check = await this.db.query<{ status: string }>(
        `SELECT status FROM projects WHERE id = $1`,
        [projectId],
      );
      if (check.rows.length === 0) throw new AuthError(404, "RESOURCE_NOT_FOUND");
      // Already trashed
    }
  }

  async restoreTrash(projectId: string, actorId: string): Promise<ProjectView> {
    const res = await this.db.query<{
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
       SET status = 'active', updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND status = 'trashed'
       RETURNING id, owner_id, title, description, main_file_id, compiler, status, current_revision, created_at, updated_at`,
      [projectId, actorId],
    );

    const row = res.rows[0];
    if (!row) {
      const check = await this.db.query<{ status: string }>(
        `SELECT status FROM projects WHERE id = $1`,
        [projectId],
      );
      if (check.rows.length === 0) throw new AuthError(404, "RESOURCE_NOT_FOUND");
      throw new AuthError(409, "INVALID_PROJECT_STATE");
    }

    return {
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
  }

  async deletePermanent(
    projectId: string,
    actorId: string,
    input?: PermanentDeleteInput,
  ): Promise<void> {
    const projRes = await this.db.query<{
      title: string;
      status: string;
      owner_id: string;
    }>(`SELECT title, status, owner_id FROM projects WHERE id = $1`, [projectId]);

    const proj = projRes.rows[0];
    if (!proj) throw new AuthError(404, "RESOURCE_NOT_FOUND");

    if (proj.owner_id !== actorId) {
      throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
    }

    // Must be in trashed state before permanent deletion
    if (proj.status !== "trashed") {
      throw new AuthError(409, "PROJECT_NOT_TRASHED");
    }

    // If confirmation title was passed, ensure exact match
    if (input?.confirmTitle && input.confirmTitle.trim() !== proj.title.trim()) {
      throw new AuthError(400, "VALIDATION_ERROR");
    }

    // Permanently remove project; cascading foreign keys will remove files, revisions, comments, etc.
    await this.db.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
  }
}

export function registerProjectLifecycleRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    service?: ProjectLifecycleService | undefined;
  },
): void {
  const service = options.service ?? (options.db ? new ProjectLifecycleService(options.db) : undefined);

  // 1. POST /api/v1/projects/:projectId/archive
  app.post(
    "/api/v1/projects/:projectId/archive",
    { config: { projectAction: "DELETE" } },
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth || auth.role !== "OWNER") throw new AuthError(403, "PROJECT_PERMISSION_DENIED");

        const project = await service.archive(projectId, auth.userId);
        return reply.code(200).type("application/json").send(project);
      } catch (error) {
        return handleLifecycleError(error, reply, request.id);
      }
    },
  );

  // 2. POST /api/v1/projects/:projectId/unarchive
  app.post(
    "/api/v1/projects/:projectId/unarchive",
    { config: { projectAction: "RESTORE" } },
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth || auth.role !== "OWNER") throw new AuthError(403, "PROJECT_PERMISSION_DENIED");

        const project = await service.unarchive(projectId, auth.userId);
        return reply.code(200).type("application/json").send(project);
      } catch (error) {
        return handleLifecycleError(error, reply, request.id);
      }
    },
  );

  // 3. POST /api/v1/projects/:projectId/trash
  app.post(
    "/api/v1/projects/:projectId/trash",
    { config: { projectAction: "DELETE" } },
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth || auth.role !== "OWNER") throw new AuthError(403, "PROJECT_PERMISSION_DENIED");

        await service.trash(projectId, auth.userId);
        return reply.code(204).send();
      } catch (error) {
        return handleLifecycleError(error, reply, request.id);
      }
    },
  );

  // 4. POST /api/v1/projects/:projectId/restore-trash
  app.post(
    "/api/v1/projects/:projectId/restore-trash",
    { config: { projectAction: "RESTORE" } },
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth || auth.role !== "OWNER") throw new AuthError(403, "PROJECT_PERMISSION_DENIED");

        const project = await service.restoreTrash(projectId, auth.userId);
        return reply.code(200).type("application/json").send(project);
      } catch (error) {
        return handleLifecycleError(error, reply, request.id);
      }
    },
  );

  // 5. DELETE /api/v1/projects/:projectId/permanent
  app.delete(
    "/api/v1/projects/:projectId/permanent",
    { config: { projectAction: "DELETE" } },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Body: PermanentDeleteInput;
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth || auth.role !== "OWNER") throw new AuthError(403, "PROJECT_PERMISSION_DENIED");

        const parsed = permanentDeleteSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        await service.deletePermanent(projectId, auth.userId, parsed.data);
        return reply.code(204).send();
      } catch (error) {
        return handleLifecycleError(error, reply, request.id);
      }
    },
  );
}
