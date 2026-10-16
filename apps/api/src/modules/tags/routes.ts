import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createTagSchema,
  updateTagSchema,
  type CreateTagInput,
  type UpdateTagInput,
  type TagView,
  type TagViewPage,
} from "@latex-collab/contracts";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import { requireSession, type ProjectAuthorization } from "../../plugins/require-session.js";

function handleTagError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  const err = error as { code?: string; cause?: { code?: string } };
  const pgCode = err.cause?.code ?? err.code;
  if (pgCode === "23505" || err.code === "CONSTRAINT_VIOLATION") {
    return reply
      .code(409)
      .type("application/problem+json")
      .send(problem(409, "TAG_CONFLICT", requestId));
  }
  throw error;
}

export class TagService {
  constructor(private readonly db: DatabaseClient) {}

  async listTags(userId: string): Promise<TagViewPage> {
    const res = await this.db.query<{ id: string; name: string; color: string }>(
      `SELECT id, name, color
       FROM project_tags
       WHERE user_id = $1
       ORDER BY name ASC`,
      [userId],
    );

    return {
      items: res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
      })),
      nextCursor: null,
    };
  }

  async createTag(userId: string, input: CreateTagInput): Promise<TagView> {
    const res = await this.db.query<{ id: string; name: string; color: string }>(
      `INSERT INTO project_tags (user_id, name, color)
       VALUES ($1, $2, $3)
       RETURNING id, name, color`,
      [userId, input.name, input.color],
    );

    const row = res.rows[0]!;
    return {
      id: row.id,
      name: row.name,
      color: row.color,
    };
  }

  async updateTag(userId: string, tagId: string, input: UpdateTagInput): Promise<TagView> {
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM project_tags WHERE id = $1 AND user_id = $2`,
      [tagId, userId],
    );
    if (existing.rows.length === 0) throw new AuthError(404, "RESOURCE_NOT_FOUND");

    const res = await this.db.query<{ id: string; name: string; color: string }>(
      `UPDATE project_tags
       SET name = coalesce($1, name),
           color = coalesce($2, color)
       WHERE id = $3 AND user_id = $4
       RETURNING id, name, color`,
      [input.name ?? null, input.color ?? null, tagId, userId],
    );

    const row = res.rows[0]!;
    return {
      id: row.id,
      name: row.name,
      color: row.color,
    };
  }

  async deleteTag(userId: string, tagId: string): Promise<void> {
    const res = await this.db.query(
      `DELETE FROM project_tags WHERE id = $1 AND user_id = $2`,
      [tagId, userId],
    );
    if (res.rowCount === 0) throw new AuthError(404, "RESOURCE_NOT_FOUND");
  }

  async linkTag(userId: string, projectId: string, tagId: string): Promise<void> {
    // Verify tag belongs to user
    const tagRes = await this.db.query<{ id: string }>(
      `SELECT id FROM project_tags WHERE id = $1 AND user_id = $2`,
      [tagId, userId],
    );
    if (tagRes.rows.length === 0) throw new AuthError(404, "RESOURCE_NOT_FOUND");

    // Insert link (idempotent)
    await this.db.query(
      `INSERT INTO project_tag_links (project_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT (project_id, tag_id) DO NOTHING`,
      [projectId, tagId],
    );
  }

  async unlinkTag(userId: string, projectId: string, tagId: string): Promise<void> {
    // Verify tag belongs to user
    const tagRes = await this.db.query<{ id: string }>(
      `SELECT id FROM project_tags WHERE id = $1 AND user_id = $2`,
      [tagId, userId],
    );
    if (tagRes.rows.length === 0) throw new AuthError(404, "RESOURCE_NOT_FOUND");

    await this.db.query(
      `DELETE FROM project_tag_links WHERE project_id = $1 AND tag_id = $2`,
      [projectId, tagId],
    );
  }
}

export function registerTagRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
    service?: TagService | undefined;
  },
): void {
  const service = options.service ?? (options.db ? new TagService(options.db) : undefined);
  const secureCookies = options.secureCookies ?? options.origin?.startsWith("https://") ?? false;

  // 1. GET /api/v1/tags
  app.get("/api/v1/tags", async (request, reply) => {
    try {
      if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const identity = await requireSession(options.db, request, options.origin, secureCookies, false);
      const result = await service.listTags(identity.userId);
      return reply.code(200).type("application/json").send(result);
    } catch (error) {
      return handleTagError(error, reply, request.id);
    }
  });

  // 2. POST /api/v1/tags
  app.post("/api/v1/tags", async (request, reply) => {
    try {
      if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const identity = await requireSession(options.db, request, options.origin, secureCookies, true);
      const parsed = createTagSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

      const result = await service.createTag(identity.userId, parsed.data);
      return reply.code(201).type("application/json").send(result);
    } catch (error) {
      return handleTagError(error, reply, request.id);
    }
  });

  // 3. PATCH /api/v1/tags/:tagId
  app.patch(
    "/api/v1/tags/:tagId",
    async (request: FastifyRequest<{ Params: { tagId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { tagId } = request.params;
        if (!isUUID(tagId)) throw new AuthError(400, "VALIDATION_ERROR");

        const identity = await requireSession(options.db, request, options.origin, secureCookies, true);
        const parsed = updateTagSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const result = await service.updateTag(identity.userId, tagId, parsed.data);
        return reply.code(200).type("application/json").send(result);
      } catch (error) {
        return handleTagError(error, reply, request.id);
      }
    },
  );

  // 4. DELETE /api/v1/tags/:tagId
  app.delete(
    "/api/v1/tags/:tagId",
    async (request: FastifyRequest<{ Params: { tagId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { tagId } = request.params;
        if (!isUUID(tagId)) throw new AuthError(400, "VALIDATION_ERROR");

        const identity = await requireSession(options.db, request, options.origin, secureCookies, true);
        await service.deleteTag(identity.userId, tagId);
        return reply.code(204).send();
      } catch (error) {
        return handleTagError(error, reply, request.id);
      }
    },
  );

  // 5. POST /api/v1/projects/:projectId/tags/:tagId
  app.post(
    "/api/v1/projects/:projectId/tags/:tagId",
    { config: { projectAction: "EDIT" } },
    async (
      request: FastifyRequest<{ Params: { projectId: string; tagId: string } }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, tagId } = request.params;
        if (!isUUID(projectId) || !isUUID(tagId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization as ProjectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        await service.linkTag(auth.userId, projectId, tagId);
        return reply.code(204).send();
      } catch (error) {
        return handleTagError(error, reply, request.id);
      }
    },
  );

  // 6. DELETE /api/v1/projects/:projectId/tags/:tagId
  app.delete(
    "/api/v1/projects/:projectId/tags/:tagId",
    { config: { projectAction: "EDIT" } },
    async (
      request: FastifyRequest<{ Params: { projectId: string; tagId: string } }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, tagId } = request.params;
        if (!isUUID(projectId) || !isUUID(tagId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization as ProjectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        await service.unlinkTag(auth.userId, projectId, tagId);
        return reply.code(204).send();
      } catch (error) {
        return handleTagError(error, reply, request.id);
      }
    },
  );
}
