import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

export const suggestionKindSchema = z.enum(["insert", "delete", "replace"]);
export type SuggestionKind = z.infer<typeof suggestionKindSchema>;

export const createSuggestionSchema = z.strictObject({
  fileId: z.string().uuid(),
  kind: suggestionKindSchema,
  baseRevision: z.string().min(1).max(255),
  anchor: z.unknown(),
  oldTextHash: z.string().min(1).max(255),
  newText: z.string().max(100000),
});
export type CreateSuggestionInput = z.infer<typeof createSuggestionSchema>;

export interface SuggestionView {
  id: string;
  projectId: string;
  fileId: string;
  authorId: string;
  authorName: string | null;
  kind: SuggestionKind;
  baseRevision: string;
  anchor: unknown;
  oldTextHash: string;
  newText: string;
  status: "pending" | "accepted" | "rejected" | "conflict";
  resolvedBy: string | null;
  createdAt: string;
}

function handleReviewError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  const pgCode = (error as { code?: string }).code;
  if (pgCode === "23505") {
    return reply
      .code(409)
      .type("application/problem+json")
      .send(problem(409, "SUGGESTION_CONFLICT", requestId));
  }
  if (pgCode === "23503") {
    return reply
      .code(404)
      .type("application/problem+json")
      .send(problem(404, "RESOURCE_NOT_FOUND", requestId));
  }
  throw error;
}

export class SuggestionService {
  constructor(private readonly db: DatabaseClient) {}

  async createSuggestion(
    projectId: string,
    authorId: string,
    input: CreateSuggestionInput,
  ): Promise<SuggestionView> {
    // 1. Verify file exists in project and is active
    const fileRes = await this.db.query<{ id: string }>(
      `SELECT id FROM project_nodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [input.fileId, projectId],
    );
    if (fileRes.rows.length === 0) {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }

    // 2. Insert suggestion record (canonical text remains completely unchanged!)
    const insertRes = await this.db.query<{
      id: string;
      project_id: string;
      file_id: string;
      author_id: string;
      kind: SuggestionKind;
      base_revision: string;
      anchor_json: unknown;
      old_text_hash: string;
      new_text: string;
      status: "pending" | "accepted" | "rejected" | "conflict";
      resolved_by: string | null;
      created_at: Date;
    }>(
      `INSERT INTO suggestions (
         project_id, file_id, author_id, kind, base_revision,
         anchor_json, old_text_hash, new_text, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id, project_id, file_id, author_id, kind, base_revision,
                 anchor_json, old_text_hash, new_text, status, resolved_by, created_at`,
      [
        projectId,
        input.fileId,
        authorId,
        input.kind,
        input.baseRevision,
        JSON.stringify(input.anchor),
        input.oldTextHash,
        input.newText,
      ],
    );

    const row = insertRes.rows[0]!;

    // Fetch author details
    const userRes = await this.db.query<{ display_name: string | null }>(
      `SELECT display_name FROM users WHERE id = $1`,
      [authorId],
    );

    return {
      id: row.id,
      projectId: row.project_id,
      fileId: row.file_id,
      authorId: row.author_id,
      authorName: userRes.rows[0]?.display_name ?? null,
      kind: row.kind,
      baseRevision: row.base_revision,
      anchor: row.anchor_json,
      oldTextHash: row.old_text_hash,
      newText: row.new_text,
      status: row.status,
      resolvedBy: row.resolved_by,
      createdAt: row.created_at.toISOString(),
    };
  }

  async listSuggestions(
    projectId: string,
    filters?: { fileId?: string | undefined; status?: string | undefined },
  ): Promise<SuggestionView[]> {
    const conditions = ["s.project_id = $1"];
    const params: unknown[] = [projectId];
    let idx = 2;

    if (filters?.fileId) {
      conditions.push(`s.file_id = $${idx++}`);
      params.push(filters.fileId);
    }

    if (filters?.status) {
      conditions.push(`s.status = $${idx++}`);
      params.push(filters.status);
    }

    const sql = `
      SELECT s.id, s.project_id, s.file_id, s.author_id, s.kind, s.base_revision,
             s.anchor_json, s.old_text_hash, s.new_text, s.status, s.resolved_by,
             s.created_at, u.display_name AS author_name
      FROM suggestions s
      LEFT JOIN users u ON u.id = s.author_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY s.created_at ASC
    `;

    const res = await this.db.query<{
      id: string;
      project_id: string;
      file_id: string;
      author_id: string;
      kind: SuggestionKind;
      base_revision: string;
      anchor_json: unknown;
      old_text_hash: string;
      new_text: string;
      status: "pending" | "accepted" | "rejected" | "conflict";
      resolved_by: string | null;
      created_at: Date;
      author_name: string | null;
    }>(sql, params);

    return res.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      fileId: r.file_id,
      authorId: r.author_id,
      authorName: r.author_name,
      kind: r.kind,
      baseRevision: r.base_revision,
      anchor: r.anchor_json,
      oldTextHash: r.old_text_hash,
      newText: r.new_text,
      status: r.status,
      resolvedBy: r.resolved_by,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async getSuggestion(projectId: string, suggestionId: string): Promise<SuggestionView | null> {
    const sql = `
      SELECT s.id, s.project_id, s.file_id, s.author_id, s.kind, s.base_revision,
             s.anchor_json, s.old_text_hash, s.new_text, s.status, s.resolved_by,
             s.created_at, u.display_name AS author_name
      FROM suggestions s
      LEFT JOIN users u ON u.id = s.author_id
      WHERE s.project_id = $1 AND s.id = $2
    `;

    const res = await this.db.query<{
      id: string;
      project_id: string;
      file_id: string;
      author_id: string;
      kind: SuggestionKind;
      base_revision: string;
      anchor_json: unknown;
      old_text_hash: string;
      new_text: string;
      status: "pending" | "accepted" | "rejected" | "conflict";
      resolved_by: string | null;
      created_at: Date;
      author_name: string | null;
    }>(sql, [projectId, suggestionId]);

    const r = res.rows[0];
    if (!r) return null;

    return {
      id: r.id,
      projectId: r.project_id,
      fileId: r.file_id,
      authorId: r.author_id,
      authorName: r.author_name,
      kind: r.kind,
      baseRevision: r.base_revision,
      anchor: r.anchor_json,
      oldTextHash: r.old_text_hash,
      newText: r.new_text,
      status: r.status,
      resolvedBy: r.resolved_by,
      createdAt: r.created_at.toISOString(),
    };
  }
}

export function registerSuggestionRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    service?: SuggestionService | undefined;
  },
): void {
  const service = options.service ?? (options.db ? new SuggestionService(options.db) : undefined);

  // 1. POST /api/v1/projects/:projectId/suggestions - create reviewer proposal
  app.post(
    "/api/v1/projects/:projectId/suggestions",
    {
      config: { projectAction: "SUGGEST" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Body: CreateSuggestionInput;
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const parsed = createSuggestionSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const suggestion = await service.createSuggestion(projectId, auth.userId, parsed.data);
        return reply.code(201).type("application/json").send(suggestion);
      } catch (error) {
        return handleReviewError(error, reply, request.id);
      }
    },
  );

  // 2. GET /api/v1/projects/:projectId/suggestions - list suggestions
  app.get(
    "/api/v1/projects/:projectId/suggestions",
    {
      config: { projectAction: "READ" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Querystring: { fileId?: string; status?: string };
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const { fileId, status } = request.query;
        if (fileId && !isUUID(fileId)) throw new AuthError(400, "VALIDATION_ERROR");

        const list = await service.listSuggestions(projectId, { fileId, status });
        return reply.code(200).type("application/json").send(list);
      } catch (error) {
        return handleReviewError(error, reply, request.id);
      }
    },
  );

  // 3. GET /api/v1/projects/:projectId/suggestions/:suggestionId - get single suggestion
  app.get(
    "/api/v1/projects/:projectId/suggestions/:suggestionId",
    {
      config: { projectAction: "READ" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string; suggestionId: string };
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, suggestionId } = request.params;
        if (!isUUID(projectId) || !isUUID(suggestionId))
          throw new AuthError(400, "VALIDATION_ERROR");

        const item = await service.getSuggestion(projectId, suggestionId);
        if (!item) throw new AuthError(404, "RESOURCE_NOT_FOUND");

        return reply.code(200).type("application/json").send(item);
      } catch (error) {
        return handleReviewError(error, reply, request.id);
      }
    },
  );
}
