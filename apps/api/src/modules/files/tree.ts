import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createNodeSchema,
  moveNodeSchema,
  renameNodeSchema,
  type ProjectNodeView,
  type TreeView,
} from "@latex-collab/contracts";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import { parseIfMatch } from "../projects/validation.js";

export function validateNodeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 255) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  if (trimmed === "." || trimmed === "..") {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  if (/[/\\]/.test(trimmed) || /[\0\r\n\x00-\x1f\x7f]/.test(trimmed)) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  return trimmed;
}

function handleTreeError(error: unknown, reply: FastifyReply, requestId: string) {
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

async function mutateNodeInternal(
  db: DatabaseClient,
  projectId: string,
  nodeId: string,
  updates: { name?: string | undefined; parentId?: string | null | undefined },
  ifMatchHeader: string | undefined,
): Promise<ProjectNodeView> {
  let validatedName: string | undefined;
  if (updates.name !== undefined) {
    validatedName = validateNodeName(updates.name);
  }

  let validatedParentId: string | null | undefined;
  if (updates.parentId !== undefined) {
    if (updates.parentId !== null && (!isUUID(updates.parentId))) {
      throw new AuthError(400, "VALIDATION_ERROR");
    }
    validatedParentId = updates.parentId;
  }

  if (validatedName === undefined && validatedParentId === undefined) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }

  const ifMatch = ifMatchHeader !== undefined ? parseIfMatch(ifMatchHeader) : null;

  return db.transaction(async (tx) => {
    // 1. Lock project for optimistic concurrency check
    const projLock = await tx.query<{ current_revision: number }>(
      `SELECT current_revision FROM projects WHERE id = $1 FOR UPDATE`,
      [projectId],
    );
    if (!projLock.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
    const currentRev = Number(projLock.rows[0].current_revision);

    if (ifMatch !== null && currentRev !== ifMatch) {
      throw new AuthError(412, "PRECONDITION_FAILED");
    }

    // 2. Lock target node
    const nodeRes = await tx.query<{
      id: string;
      project_id: string;
      parent_id: string | null;
      name: string;
      kind: ProjectNodeView["kind"];
      mime: string;
      size_bytes: number;
      content_kind: ProjectNodeView["contentKind"];
    }>(
      `SELECT id, project_id, parent_id, name, kind, mime, size_bytes, content_kind
       FROM project_nodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [nodeId, projectId],
    );
    const node = nodeRes.rows[0];
    if (!node) throw new AuthError(404, "RESOURCE_NOT_FOUND");

    const finalName = validatedName ?? node.name;
    const finalParentId = validatedParentId !== undefined ? validatedParentId : node.parent_id;

    // 3. Parent validations if changing parent
    if (validatedParentId !== undefined && validatedParentId !== node.parent_id) {
      if (validatedParentId === nodeId) {
        throw new AuthError(400, "VALIDATION_ERROR");
      }

      if (validatedParentId !== null) {
        // Parent must exist in the same project, not deleted, and be a FOLDER
        const parentRes = await tx.query<{ id: string; kind: string }>(
          `SELECT id, kind FROM project_nodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
          [validatedParentId, projectId],
        );
        if (!parentRes.rows[0]) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }
        if (parentRes.rows[0].kind !== "FOLDER") {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        // Cycle check: verify nodeId is not an ancestor of validatedParentId
        const cycleRes = await tx.query<{ id: string }>(
          `WITH RECURSIVE ancestors AS (
             SELECT id, parent_id FROM project_nodes
             WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
             UNION ALL
             SELECT pn.id, pn.parent_id FROM project_nodes pn
             JOIN ancestors a ON pn.id = a.parent_id
             WHERE pn.deleted_at IS NULL
           )
           SELECT id FROM ancestors WHERE id = $3`,
          [validatedParentId, projectId, nodeId],
        );
        if (cycleRes.rows.length > 0) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }
      }
    }

    // 4. Sibling name conflict check
    const siblingConflict = await tx.query<{ id: string }>(
      `SELECT id FROM project_nodes
       WHERE project_id = $1 AND name = $2 AND id != $3 AND deleted_at IS NULL
         AND ((parent_id IS NULL AND $4::uuid IS NULL) OR parent_id = $4::uuid)`,
      [projectId, finalName, nodeId, finalParentId],
    );
    if (siblingConflict.rows.length > 0) {
      throw new AuthError(409, "REVISION_CONFLICT");
    }

    // 5. Update node
    await tx.query(
      `UPDATE project_nodes
       SET name = $1, parent_id = $2
       WHERE id = $3`,
      [finalName, finalParentId, nodeId],
    );

    // 6. Advance project revision
    const newRev = currentRev + 1;
    await tx.query(
      `UPDATE projects SET current_revision = $1, updated_at = now() WHERE id = $2`,
      [newRev, projectId],
    );

    const nodeView: ProjectNodeView = {
      id: node.id,
      projectId: node.project_id,
      parentId: finalParentId,
      name: finalName,
      kind: node.kind,
      mime: node.mime,
      sizeBytes: Number(node.size_bytes),
      contentKind: node.content_kind,
      treeVersion: newRev,
      deletedAt: null,
    };
    return nodeView;
  });
}

export function registerTreeRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
  },
): void {
  // 1. GET /api/v1/projects/:projectId/nodes
  app.get(
    "/api/v1/projects/:projectId/nodes",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params as { projectId: string };

        const projRes = await options.db.query<{ current_revision: number }>(
          `SELECT current_revision FROM projects WHERE id = $1`,
          [projectId],
        );
        if (!projRes.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        const treeVersion = Number(projRes.rows[0].current_revision);

        const nodesRes = await options.db.query<{
          id: string;
          project_id: string;
          parent_id: string | null;
          name: string;
          kind: ProjectNodeView["kind"];
          mime: string;
          size_bytes: number;
          content_kind: ProjectNodeView["contentKind"];
          deleted_at: Date | null;
        }>(
          `SELECT id, project_id, parent_id, name, kind, mime, size_bytes, content_kind, deleted_at
           FROM project_nodes
           WHERE project_id = $1 AND deleted_at IS NULL
           ORDER BY (parent_id IS NULL) DESC, name ASC`,
          [projectId],
        );

        const items: ProjectNodeView[] = nodesRes.rows.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          parentId: r.parent_id,
          name: r.name,
          kind: r.kind,
          mime: r.mime,
          sizeBytes: Number(r.size_bytes),
          contentKind: r.content_kind,
          treeVersion,
          deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
        }));

        const treeView: TreeView = {
          projectId,
          treeVersion,
          items,
        };
        return treeView;
      } catch (error) {
        return handleTreeError(error, reply, request.id);
      }
    },
  );

  // 2. POST /api/v1/projects/:projectId/nodes
  app.post(
    "/api/v1/projects/:projectId/nodes",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params as { projectId: string };

        const parsed = createNodeSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const name = validateNodeName(parsed.data.name);
        const parentId = parsed.data.parentId;

        if (parentId !== null && !isUUID(parentId)) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const ifMatchHeader = request.headers["if-match"];
        const ifMatch = ifMatchHeader !== undefined ? parseIfMatch(ifMatchHeader) : null;

        const result = await options.db.transaction(async (tx) => {
          // Lock project for version stability
          const projLock = await tx.query<{ current_revision: number }>(
            `SELECT current_revision FROM projects WHERE id = $1 FOR UPDATE`,
            [projectId],
          );
          if (!projLock.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          const currentRev = Number(projLock.rows[0].current_revision);

          if (ifMatch !== null && currentRev !== ifMatch) {
            throw new AuthError(412, "PRECONDITION_FAILED");
          }

          // Check parent if specified
          if (parentId !== null) {
            const parentCheck = await tx.query<{ id: string; kind: string }>(
              `SELECT id, kind FROM project_nodes
               WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
              [parentId, projectId],
            );
            if (!parentCheck.rows[0]) {
              throw new AuthError(404, "RESOURCE_NOT_FOUND");
            }
            if (parentCheck.rows[0].kind !== "FOLDER") {
              throw new AuthError(400, "VALIDATION_ERROR");
            }
          }

          // Sibling name conflict check
          const siblingCheck = await tx.query<{ id: string }>(
            `SELECT id FROM project_nodes
             WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL
               AND ((parent_id IS NULL AND $3::uuid IS NULL) OR parent_id = $3::uuid)`,
            [projectId, name, parentId],
          );
          if (siblingCheck.rows.length > 0) {
            throw new AuthError(409, "REVISION_CONFLICT");
          }

          const newNodeId = randomUUID();
          await tx.query(
            `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
            [
              newNodeId,
              projectId,
              parentId,
              name,
              parsed.data.kind,
              parsed.data.mime,
              parsed.data.contentKind,
            ],
          );

          if (parsed.data.kind === "FILE" && parsed.data.contentKind === "TEXT") {
            await tx.query(
              `INSERT INTO text_documents (file_id, project_id, last_persisted_seq)
               VALUES ($1, $2, 0)`,
              [newNodeId, projectId],
            );
          }

          const newRev = currentRev + 1;
          await tx.query(
            `UPDATE projects SET current_revision = $1, updated_at = now() WHERE id = $2`,
            [newRev, projectId],
          );

          const nodeView: ProjectNodeView = {
            id: newNodeId,
            projectId,
            parentId,
            name,
            kind: parsed.data.kind,
            mime: parsed.data.mime,
            sizeBytes: 0,
            contentKind: parsed.data.contentKind,
            treeVersion: newRev,
            deletedAt: null,
          };
          return nodeView;
        });

        return reply.code(201).send(result);
      } catch (error) {
        return handleTreeError(error, reply, request.id);
      }
    },
  );

  // 3. PATCH /api/v1/projects/:projectId/nodes/:nodeId - general patch (rename and/or move)
  app.patch(
    "/api/v1/projects/:projectId/nodes/:nodeId",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, nodeId } = request.params as { projectId: string; nodeId: string };
        if (!isUUID(nodeId)) throw new AuthError(400, "VALIDATION_ERROR");

        const body = request.body as Record<string, unknown> | null;
        if (!body || typeof body !== "object") throw new AuthError(400, "VALIDATION_ERROR");

        const hasName = "name" in body && body.name !== undefined;
        const hasParent =
          ("parentId" in body && body.parentId !== undefined) ||
          ("targetParentId" in body && body.targetParentId !== undefined);

        if (!hasName && !hasParent) throw new AuthError(400, "VALIDATION_ERROR");

        let name: string | undefined;
        if (hasName) {
          if (typeof body.name !== "string") throw new AuthError(400, "VALIDATION_ERROR");
          name = body.name;
        }

        let parentId: string | null | undefined;
        if (hasParent) {
          const rawParent = (body.targetParentId ?? body.parentId) as unknown;
          if (rawParent !== null && (typeof rawParent !== "string" || !isUUID(rawParent))) {
            throw new AuthError(400, "VALIDATION_ERROR");
          }
          parentId = rawParent;
        }

        const updated = await mutateNodeInternal(
          options.db,
          projectId,
          nodeId,
          { name, parentId },
          request.headers["if-match"],
        );

        return reply.code(200).send(updated);
      } catch (error) {
        return handleTreeError(error, reply, request.id);
      }
    },
  );

  // 3a. PATCH /api/v1/projects/:projectId/nodes/:nodeId/move
  app.patch(
    "/api/v1/projects/:projectId/nodes/:nodeId/move",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, nodeId } = request.params as { projectId: string; nodeId: string };
        if (!isUUID(nodeId)) throw new AuthError(400, "VALIDATION_ERROR");

        const parsed = moveNodeSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const updated = await mutateNodeInternal(
          options.db,
          projectId,
          nodeId,
          { parentId: parsed.data.targetParentId },
          request.headers["if-match"],
        );

        return reply.code(200).send(updated);
      } catch (error) {
        return handleTreeError(error, reply, request.id);
      }
    },
  );

  // 3b. PATCH /api/v1/projects/:projectId/nodes/:nodeId/rename
  app.patch(
    "/api/v1/projects/:projectId/nodes/:nodeId/rename",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, nodeId } = request.params as { projectId: string; nodeId: string };
        if (!isUUID(nodeId)) throw new AuthError(400, "VALIDATION_ERROR");

        const parsed = renameNodeSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const updated = await mutateNodeInternal(
          options.db,
          projectId,
          nodeId,
          { name: parsed.data.name },
          request.headers["if-match"],
        );

        return reply.code(200).send(updated);
      } catch (error) {
        return handleTreeError(error, reply, request.id);
      }
    },
  );

  // 4. DELETE /api/v1/projects/:projectId/nodes/:nodeId
  app.delete(
    "/api/v1/projects/:projectId/nodes/:nodeId",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, nodeId } = request.params as { projectId: string; nodeId: string };
        if (!isUUID(nodeId)) throw new AuthError(400, "VALIDATION_ERROR");

        const ifMatchHeader = request.headers["if-match"];
        const ifMatch = ifMatchHeader !== undefined ? parseIfMatch(ifMatchHeader) : null;

        await options.db.transaction(async (tx) => {
          const projLock = await tx.query<{ current_revision: number }>(
            `SELECT current_revision FROM projects WHERE id = $1 FOR UPDATE`,
            [projectId],
          );
          if (!projLock.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          const currentRev = Number(projLock.rows[0].current_revision);

          if (ifMatch !== null && currentRev !== ifMatch) {
            throw new AuthError(412, "PRECONDITION_FAILED");
          }

          const nodeRes = await tx.query<{ id: string }>(
            `SELECT id FROM project_nodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [nodeId, projectId],
          );
          if (!nodeRes.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");

          // Recursively soft-delete node and all descendants
          await tx.query(
            `WITH RECURSIVE subnodes AS (
               SELECT id FROM project_nodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
               UNION ALL
               SELECT pn.id FROM project_nodes pn
               JOIN subnodes sn ON pn.parent_id = sn.id
               WHERE pn.deleted_at IS NULL
             )
             UPDATE project_nodes SET deleted_at = now()
             WHERE id IN (SELECT id FROM subnodes)`,
            [nodeId, projectId],
          );

          // Clear main_file_id if it pointed to this node or any deleted descendant
          await tx.query(
            `WITH RECURSIVE subnodes AS (
               SELECT id FROM project_nodes WHERE id = $1 AND project_id = $2
               UNION ALL
               SELECT pn.id FROM project_nodes pn
               JOIN subnodes sn ON pn.parent_id = sn.id
             )
             UPDATE projects SET main_file_id = NULL
             WHERE id = $2 AND main_file_id IN (SELECT id FROM subnodes)`,
            [nodeId, projectId],
          );

          const newRev = currentRev + 1;
          await tx.query(
            `UPDATE projects SET current_revision = $1, updated_at = now() WHERE id = $2`,
            [newRev, projectId],
          );
        });

        return reply.code(204).send();
      } catch (error) {
        return handleTreeError(error, reply, request.id);
      }
    },
  );
}
