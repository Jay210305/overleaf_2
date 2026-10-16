import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { DatabaseClient } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import type { SessionIdentity } from "../../plugins/require-session.js";

export const bulkProjectActionSchema = z.enum(["archive", "tag", "trash", "restore"]);
export type BulkProjectAction = z.infer<typeof bulkProjectActionSchema>;

export const bulkRequestSchema = z
  .strictObject({
    projectIds: z.array(z.string().uuid()).min(1).max(100),
    action: bulkProjectActionSchema,
    tagId: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      if (data.action === "tag") {
        return !!data.tagId;
      }
      return true;
    },
    { message: "tagId is required when action is 'tag'" },
  );

export type BulkRequestInput = z.infer<typeof bulkRequestSchema>;

export interface BulkItemResult {
  projectId: string;
  ok: boolean;
  errorCode: string | null;
}

export interface BulkResponse {
  results: BulkItemResult[];
}

function handleBulkError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  throw error;
}

export class BulkProjectService {
  constructor(private readonly db: DatabaseClient) {}

  async executeBulk(
    userId: string,
    input: BulkRequestInput,
  ): Promise<BulkResponse> {
    // If tag action, verify tag exists and belongs to userId
    if (input.action === "tag") {
      const tagCheck = await this.db.query<{ id: string }>(
        `SELECT id FROM project_tags WHERE id = $1 AND user_id = $2`,
        [input.tagId!, userId],
      );
      if (tagCheck.rows.length === 0) {
        throw new AuthError(404, "RESOURCE_NOT_FOUND");
      }
    }

    const results: BulkItemResult[] = [];

    for (const projectId of input.projectIds) {
      try {
        // Query project and user's role on it
        const projRes = await this.db.query<{
          id: string;
          owner_id: string;
          status: string;
          role: string | null;
          revoked_at: Date | null;
        }>(
          `SELECT p.id, p.owner_id, p.status, pm.role, pm.revoked_at
           FROM projects p
           LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
           WHERE p.id = $1`,
          [projectId, userId],
        );

        const row = projRes.rows[0];
        if (!row) {
          results.push({
            projectId,
            ok: false,
            errorCode: "RESOURCE_NOT_FOUND",
          });
          continue;
        }

        const role =
          row.owner_id === userId
            ? "OWNER"
            : row.revoked_at
              ? null
              : row.role;

        if (!role) {
          results.push({
            projectId,
            ok: false,
            errorCode: "RESOURCE_NOT_FOUND",
          });
          continue;
        }

        // Check permission by action
        switch (input.action) {
          case "archive": {
            if (role !== "OWNER") {
              results.push({
                projectId,
                ok: false,
                errorCode: "PROJECT_PERMISSION_DENIED",
              });
              continue;
            }
            if (row.status !== "active") {
              results.push({
                projectId,
                ok: false,
                errorCode: "INVALID_PROJECT_STATE",
              });
              continue;
            }
            await this.db.query(
              `UPDATE projects SET status = 'archived', updated_at = now() WHERE id = $1`,
              [projectId],
            );
            results.push({ projectId, ok: true, errorCode: null });
            break;
          }

          case "trash": {
            if (role !== "OWNER") {
              results.push({
                projectId,
                ok: false,
                errorCode: "PROJECT_PERMISSION_DENIED",
              });
              continue;
            }
            await this.db.query(
              `UPDATE projects SET status = 'trashed', updated_at = now() WHERE id = $1`,
              [projectId],
            );
            results.push({ projectId, ok: true, errorCode: null });
            break;
          }

          case "restore": {
            if (role !== "OWNER") {
              results.push({
                projectId,
                ok: false,
                errorCode: "PROJECT_PERMISSION_DENIED",
              });
              continue;
            }
            await this.db.query(
              `UPDATE projects SET status = 'active', updated_at = now() WHERE id = $1`,
              [projectId],
            );
            results.push({ projectId, ok: true, errorCode: null });
            break;
          }

          case "tag": {
            // Tagging is allowed for OWNER and EDITOR
            if (role !== "OWNER" && role !== "EDITOR") {
              results.push({
                projectId,
                ok: false,
                errorCode: "PROJECT_PERMISSION_DENIED",
              });
              continue;
            }
            await this.db.query(
              `INSERT INTO project_tag_links (project_id, tag_id)
               VALUES ($1, $2)
               ON CONFLICT (project_id, tag_id) DO NOTHING`,
              [projectId, input.tagId!],
            );
            results.push({ projectId, ok: true, errorCode: null });
            break;
          }
        }
      } catch {
        results.push({
          projectId,
          ok: false,
          errorCode: "OPERATION_FAILED",
        });
      }
    }

    return { results };
  }
}

export function registerBulkProjectRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    service?: BulkProjectService | undefined;
  },
): void {
  const service = options.service ?? (options.db ? new BulkProjectService(options.db) : undefined);

  app.post(
    "/api/v1/projects/bulk",
    {
      config: { sessionOnly: true },
    },
    async (request, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = request.sessionIdentity as SessionIdentity;
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const parsed = bulkRequestSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const result = await service.executeBulk(identity.userId, parsed.data);
        return reply.code(200).type("application/json").send(result);
      } catch (error) {
        return handleBulkError(error, reply, request.id);
      }
    },
  );
}
