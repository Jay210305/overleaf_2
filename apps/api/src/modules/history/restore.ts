import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DatabaseClient, RevisionsRepository, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import { detachAnchorsForChangedNodes } from "./restore-metadata.js";

export const restoreInputSchema = z
  .object({
    revisionId: z.string().uuid().optional(),
    revisionNo: z.number().int().min(0).optional(),
    expectedRevision: z.number().int().min(0),
    fileId: z.string().uuid().optional(),
  })
  .refine((data) => data.revisionId !== undefined || data.revisionNo !== undefined, {
    message: "Either revisionId or revisionNo must be provided",
  });

export type RestoreInput = z.infer<typeof restoreInputSchema>;

export interface RestoreResult {
  newRevisionId: string;
  revisionNo: number;
  changedNodeIds: string[];
  detachedAnchorIds: string[];
}

export class RestoreService {
  private readonly revisionsRepo: RevisionsRepository;

  constructor(private readonly db: DatabaseClient) {
    this.revisionsRepo = new RevisionsRepository(db);
  }

  async restore(projectId: string, actorId: string, input: RestoreInput): Promise<RestoreResult> {
    return this.db.transaction(async (tx) => {
      // 1. Lock project row
      const projRes = await tx.query<{
        id: string;
        current_revision: number;
        status: string;
      }>(
        `SELECT id, current_revision, status
         FROM projects
         WHERE id = $1 FOR UPDATE`,
        [projectId],
      );
      const proj = projRes.rows[0];
      if (!proj) {
        throw new AuthError(404, "RESOURCE_NOT_FOUND");
      }

      // Check expectedRevision version guard
      const currentRevNo = Number(proj.current_revision);
      if (currentRevNo !== input.expectedRevision) {
        throw new AuthError(409, "REVISION_CONFLICT");
      }

      // 2. Fetch target revision
      let targetRevQuery = `
        SELECT id, revision_no, label
        FROM project_revisions
        WHERE project_id = $1
      `;
      const targetParams: unknown[] = [projectId];
      if (input.revisionId) {
        targetRevQuery += ` AND id = $2`;
        targetParams.push(input.revisionId);
      } else {
        targetRevQuery += ` AND revision_no = $2`;
        targetParams.push(input.revisionNo);
      }

      const targetRevRes = await tx.query<{
        id: string;
        revision_no: number;
        label: string | null;
      }>(targetRevQuery, targetParams);

      const targetRev = targetRevRes.rows[0];
      if (!targetRev) {
        throw new AuthError(404, "RESOURCE_NOT_FOUND");
      }

      // 3. Fetch revision items for target revision
      const itemsRes = await tx.query<{
        node_id: string;
        path: string;
        blob_key: string;
        sha256: string;
        deleted: boolean;
      }>(
        `SELECT node_id, path, blob_key, sha256, deleted
         FROM revision_items
         WHERE revision_id = $1`,
        [targetRev.id],
      );
      const targetItems = itemsRes.rows;

      const changedNodeIds: string[] = [];
      let label: string;

      if (input.fileId) {
        // Single file restore
        const targetItem = targetItems.find((i) => i.node_id === input.fileId);
        if (!targetItem) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }

        // Check if node exists in project_nodes
        const existingNode = await tx.query<{ id: string }>(
          `SELECT id FROM project_nodes WHERE id = $1 AND project_id = $2`,
          [input.fileId, projectId],
        );

        if (existingNode.rows.length > 0) {
          await tx.query(
            `UPDATE project_nodes
             SET deleted_at = NULL, blob_key = $1
             WHERE id = $2`,
            [targetItem.blob_key, input.fileId],
          );
        } else {
          // Re-create node if it was completely purged
          const name = targetItem.path.split("/").pop() || targetItem.path;
          const mime = targetItem.path.endsWith(".tex")
            ? "application/x-tex"
            : "application/octet-stream";
          const contentKind = targetItem.path.endsWith(".tex") ? "TEXT" : "BINARY";
          await tx.query(
            `INSERT INTO project_nodes (id, project_id, name, kind, mime, content_kind, blob_key)
             VALUES ($1, $2, $3, 'FILE', $4, $5, $6)`,
            [input.fileId, projectId, name, mime, contentKind, targetItem.blob_key],
          );
        }

        changedNodeIds.push(input.fileId);
        label = `Restored file ${targetItem.path} from v${targetRev.revision_no}`;
      } else {
        // Whole project restore
        const targetNodeIds = new Set(targetItems.map((i) => i.node_id));

        // Mark active nodes not in target revision as deleted
        await tx.query(
          `UPDATE project_nodes
           SET deleted_at = now()
           WHERE project_id = $1 AND deleted_at IS NULL AND id NOT IN (${
             targetNodeIds.size > 0
               ? Array.from(targetNodeIds)
                   .map((_, i) => `$${i + 2}`)
                   .join(",")
               : "NULL"
           })`,
          [projectId, ...Array.from(targetNodeIds)],
        );

        // Restore each node from target revision
        for (const item of targetItems) {
          const existing = await tx.query<{ id: string }>(
            `SELECT id FROM project_nodes WHERE id = $1 AND project_id = $2`,
            [item.node_id, projectId],
          );

          if (existing.rows.length > 0) {
            await tx.query(
              `UPDATE project_nodes
               SET deleted_at = NULL, blob_key = $1
               WHERE id = $2`,
              [item.blob_key, item.node_id],
            );
          } else {
            const name = item.path.split("/").pop() || item.path;
            const mime = item.path.endsWith(".tex")
              ? "application/x-tex"
              : "application/octet-stream";
            const contentKind = item.path.endsWith(".tex") ? "TEXT" : "BINARY";
            await tx.query(
              `INSERT INTO project_nodes (id, project_id, name, kind, mime, content_kind, blob_key)
               VALUES ($1, $2, $3, 'FILE', $4, $5, $6)`,
              [item.node_id, projectId, name, mime, contentKind, item.blob_key],
            );
          }
          changedNodeIds.push(item.node_id);
        }

        label = `Restored project from v${targetRev.revision_no}`;
      }

      // 4. Detach anchors for changed nodes (COL-06 / S09-T06)
      const { detachedCommentIds } = await detachAnchorsForChangedNodes(
        tx,
        projectId,
        changedNodeIds,
      );

      // 5. Create new structural revision capturing restored state
      const newRev = await this.revisionsRepo.createStructuralRevision(
        {
          projectId,
          authorId: actorId,
          source: "restore",
          label,
        },
        tx,
      );

      return {
        newRevisionId: newRev.id,
        revisionNo: newRev.revisionNo,
        changedNodeIds,
        detachedAnchorIds: detachedCommentIds,
      };
    });
  }
}

function handleRestoreError(error: unknown, reply: FastifyReply, requestId: string) {
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
  throw error;
}

export function registerRestoreRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    service?: RestoreService | undefined;
  },
): void {
  const service = options.service ?? (options.db ? new RestoreService(options.db) : undefined);

  app.post(
    "/api/v1/projects/:projectId/restore",
    {
      config: { projectAction: "RESTORE" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Body: RestoreInput;
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const parsed = restoreInputSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const result = await service.restore(projectId, auth.userId, parsed.data);
        return reply.code(200).type("application/json").send(result);
      } catch (error) {
        return handleRestoreError(error, reply, request.id);
      }
    },
  );
}
