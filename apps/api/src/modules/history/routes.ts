import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DatabaseClient, RevisionsRepository, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

const listRevisionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  label: z.string().optional(),
});

const updateRevisionLabelSchema = z.object({
  label: z.string().max(255).nullable(),
});

export interface RevisionSummary {
  id: string;
  revisionNo: number;
  manifestKey: string;
  manifestHash: string;
  authorId: string | null;
  authorName: string | null;
  source: string;
  label: string | null;
  createdAt: string;
}

export interface PaginatedRevisionsResponse {
  items: RevisionSummary[];
  nextCursor: string | null;
}

function handleHistoryError(error: unknown, reply: FastifyReply, requestId: string) {
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
      .send(problem(409, "REVISION_CONFLICT", requestId));
  }
  if (pgCode === "23503") {
    return reply
      .code(404)
      .type("application/problem+json")
      .send(problem(404, "RESOURCE_NOT_FOUND", requestId));
  }
  throw error;
}

export function registerHistoryRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
  },
): void {
  const revisionsRepo = options.db ? new RevisionsRepository(options.db) : undefined;

  // 1. GET /api/v1/projects/:projectId/revisions - paginated revision history
  app.get(
    "/api/v1/projects/:projectId/revisions",
    {
      config: { projectAction: "READ" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Querystring: { cursor?: string; limit?: string | number; label?: string };
      }>,
      reply,
    ) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const parsedQuery = listRevisionsQuerySchema.safeParse(request.query ?? {});
        if (!parsedQuery.success) throw new AuthError(400, "VALIDATION_ERROR");

        const { cursor, limit, label } = parsedQuery.data;

        const conditions: string[] = ["r.project_id = $1"];
        const values: unknown[] = [projectId];
        let paramIdx = 2;

        if (cursor) {
          const cursorRevNo = parseInt(cursor, 10);
          if (isNaN(cursorRevNo) || cursorRevNo < 0) {
            throw new AuthError(400, "VALIDATION_ERROR");
          }
          conditions.push(`r.revision_no < $${paramIdx++}`);
          values.push(cursorRevNo);
        }

        if (label && label.trim().length > 0) {
          conditions.push(`r.label ILIKE $${paramIdx++}`);
          values.push(`%${label.trim()}%`);
        }

        values.push(limit + 1);
        const limitParam = `$${paramIdx}`;

        const sql = `
          SELECT r.id, r.revision_no, r.manifest_key, r.manifest_hash,
                 r.author_id, r.source, r.label, r.created_at,
                 u.display_name AS author_name
          FROM project_revisions r
          LEFT JOIN users u ON u.id = r.author_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY r.revision_no DESC
          LIMIT ${limitParam}
        `;

        const res = await options.db.query<{
          id: string;
          revision_no: number;
          manifest_key: string;
          manifest_hash: string;
          author_id: string | null;
          source: string;
          label: string | null;
          created_at: Date;
          author_name: string | null;
        }>(sql, values);

        const hasMore = res.rows.length > limit;
        const pageRows = hasMore ? res.rows.slice(0, limit) : res.rows;
        const nextCursor = hasMore && pageRows.length > 0
          ? String(pageRows[pageRows.length - 1]!.revision_no)
          : null;

        const items: RevisionSummary[] = pageRows.map((r) => ({
          id: r.id,
          revisionNo: Number(r.revision_no),
          manifestKey: r.manifest_key,
          manifestHash: r.manifest_hash,
          authorId: r.author_id,
          authorName: r.author_name,
          source: r.source,
          label: r.label,
          createdAt: r.created_at.toISOString(),
        }));

        return reply.code(200).type("application/json").send({
          items,
          nextCursor,
        });
      } catch (error) {
        return handleHistoryError(error, reply, request.id);
      }
    },
  );

  // 2. GET /api/v1/projects/:projectId/revisions/:revisionNo - full revision manifest
  app.get(
    "/api/v1/projects/:projectId/revisions/:revisionNo",
    {
      config: { projectAction: "READ" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string; revisionNo: string };
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !revisionsRepo) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, revisionNo: revNoStr } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const revisionNo = parseInt(revNoStr, 10);
        if (isNaN(revisionNo) || revisionNo < 0) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const rev = await revisionsRepo.getRevision(projectId, revisionNo);
        if (!rev) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }

        return reply.code(200).type("application/json").send(rev);
      } catch (error) {
        return handleHistoryError(error, reply, request.id);
      }
    },
  );

  // 3. POST /api/v1/projects/:projectId/revisions/:revisionNo/label - label an immutable revision
  app.post(
    "/api/v1/projects/:projectId/revisions/:revisionNo/label",
    {
      config: { projectAction: "EDIT" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string; revisionNo: string };
        Body: { label: string | null };
      }>,
      reply,
    ) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, revisionNo: revNoStr } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const revisionNo = parseInt(revNoStr, 10);
        if (isNaN(revisionNo) || revisionNo < 0) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const parsed = updateRevisionLabelSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const updateRes = await options.db.query<{
          id: string;
          revision_no: number;
          label: string | null;
        }>(
          `UPDATE project_revisions
           SET label = $1
           WHERE project_id = $2 AND revision_no = $3
           RETURNING id, revision_no, label`,
          [parsed.data.label, projectId, revisionNo],
        );

        if (updateRes.rows.length === 0) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }

        const row = updateRes.rows[0]!;
        return reply.code(200).type("application/json").send({
          id: row.id,
          revisionNo: Number(row.revision_no),
          label: row.label,
        });
      } catch (error) {
        return handleHistoryError(error, reply, request.id);
      }
    },
  );
}
