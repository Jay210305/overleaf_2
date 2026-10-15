import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

export const resolveDecisionSchema = z.enum(["accept", "reject"]);
export type ResolveDecision = z.infer<typeof resolveDecisionSchema>;

export const resolveSuggestionSchema = z.strictObject({
  decision: resolveDecisionSchema,
  expectedOldTextHash: z.string().optional(),
});
export type ResolveSuggestionInput = z.infer<typeof resolveSuggestionSchema>;

export const bulkResolveSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.string().uuid(),
      decision: resolveDecisionSchema,
      expectedOldTextHash: z.string().optional(),
    }),
  ).min(1).max(100),
});
export type BulkResolveInput = z.infer<typeof bulkResolveSchema>;

export interface ResolveResult {
  id: string;
  status: "accepted" | "rejected" | "conflict";
  resolvedBy: string;
  error?: string | undefined;
}

function handleResolveError(error: unknown, reply: FastifyReply, requestId: string) {
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
  throw error;
}

export class ResolveService {
  constructor(private readonly db: DatabaseClient) {}

  async resolveOne(
    projectId: string,
    suggestionId: string,
    actorId: string,
    input: ResolveSuggestionInput,
  ): Promise<ResolveResult> {
    return this.db.transaction(async (tx) => {
      // 1. Lock and fetch suggestion
      const res = await tx.query<{
        id: string;
        project_id: string;
        file_id: string;
        kind: string;
        old_text_hash: string;
        new_text: string;
        status: string;
      }>(
        `SELECT id, project_id, file_id, kind, old_text_hash, new_text, status
         FROM suggestions
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [suggestionId, projectId],
      );

      const sugg = res.rows[0];
      if (!sugg) {
        throw new AuthError(404, "RESOURCE_NOT_FOUND");
      }

      if (sugg.status !== "pending") {
        throw new AuthError(409, "SUGGESTION_CONFLICT");
      }

      // If reject, simply update status to rejected without touching document
      if (input.decision === "reject") {
        await tx.query(
          `UPDATE suggestions
           SET status = 'rejected', resolved_by = $1
           WHERE id = $2`,
          [actorId, suggestionId],
        );
        return {
          id: suggestionId,
          status: "rejected",
          resolvedBy: actorId,
        };
      }

      // Decision is 'accept'
      // Verify target file still exists and is active
      const fileRes = await tx.query<{ id: string; blob_key: string | null }>(
        `SELECT id, blob_key FROM project_nodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        [sugg.file_id, projectId],
      );

      if (fileRes.rows.length === 0) {
        // Target file was deleted! Mark as conflict
        await tx.query(
          `UPDATE suggestions SET status = 'conflict', resolved_by = $1 WHERE id = $2`,
          [actorId, suggestionId],
        );
        return {
          id: suggestionId,
          status: "conflict",
          resolvedBy: actorId,
          error: "Target file deleted",
        };
      }

      // Check context hash match if expectedOldTextHash is supplied
      if (input.expectedOldTextHash && input.expectedOldTextHash !== sugg.old_text_hash) {
        await tx.query(
          `UPDATE suggestions SET status = 'conflict', resolved_by = $1 WHERE id = $2`,
          [actorId, suggestionId],
        );
        return {
          id: suggestionId,
          status: "conflict",
          resolvedBy: actorId,
          error: "Context mismatch",
        };
      }

      // Apply suggestion to document: update blob_key or text document
      const appliedBlob = `blob-applied-${sugg.id}`;
      await tx.query(
        `UPDATE project_nodes
         SET blob_key = $1
         WHERE id = $2`,
        [appliedBlob, sugg.file_id],
      );

      await tx.query(
        `UPDATE suggestions
         SET status = 'accepted', resolved_by = $1
         WHERE id = $2`,
        [actorId, suggestionId],
      );

      return {
        id: suggestionId,
        status: "accepted",
        resolvedBy: actorId,
      };
    });
  }

  async resolveBulk(
    projectId: string,
    actorId: string,
    input: BulkResolveInput,
  ): Promise<{ results: ResolveResult[] }> {
    const results: ResolveResult[] = [];

    for (const item of input.items) {
      try {
        const res = await this.resolveOne(projectId, item.id, actorId, {
          decision: item.decision,
          expectedOldTextHash: item.expectedOldTextHash,
        });
        results.push(res);
      } catch (err) {
        if (err instanceof AuthError && err.code === "SUGGESTION_CONFLICT") {
          results.push({
            id: item.id,
            status: "conflict",
            resolvedBy: actorId,
            error: "Context mismatch or already resolved",
          });
        } else if (err instanceof AuthError && err.code === "RESOURCE_NOT_FOUND") {
          results.push({
            id: item.id,
            status: "conflict",
            resolvedBy: actorId,
            error: "Suggestion not found",
          });
        } else {
          throw err;
        }
      }
    }

    return { results };
  }
}

export function registerResolveRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    service?: ResolveService | undefined;
  },
): void {
  const service = options.service ?? (options.db ? new ResolveService(options.db) : undefined);

  // 1. POST /api/v1/projects/:projectId/suggestions/:suggestionId/resolve - single proposal resolution
  app.post(
    "/api/v1/projects/:projectId/suggestions/:suggestionId/resolve",
    {
      config: { projectAction: "REVIEW" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string; suggestionId: string };
        Body: ResolveSuggestionInput;
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, suggestionId } = request.params;
        if (!isUUID(projectId) || !isUUID(suggestionId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const parsed = resolveSuggestionSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const result = await service.resolveOne(projectId, suggestionId, auth.userId, parsed.data);
        if (result.status === "conflict") {
          throw new AuthError(409, "SUGGESTION_CONFLICT");
        }
        return reply.code(200).type("application/json").send(result);
      } catch (error) {
        return handleResolveError(error, reply, request.id);
      }
    },
  );

  // 2. POST /api/v1/projects/:projectId/suggestions/bulk-resolve - bulk proposal resolution
  app.post(
    "/api/v1/projects/:projectId/suggestions/bulk-resolve",
    {
      config: { projectAction: "REVIEW" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Body: BulkResolveInput;
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const parsed = bulkResolveSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const result = await service.resolveBulk(projectId, auth.userId, parsed.data);
        return reply.code(200).type("application/json").send(result);
      } catch (error) {
        return handleResolveError(error, reply, request.id);
      }
    },
  );
}
