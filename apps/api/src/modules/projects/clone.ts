import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@latex-collab/db";
import type { ProjectView } from "@latex-collab/contracts";
import { AuthError } from "../auth/errors.js";
import { validateProjectTitle } from "./validation.js";

export async function cloneProject(
  db: DatabaseClient,
  sourceProjectId: string,
  targetUserId: string,
  customTitle?: string,
): Promise<ProjectView> {
  return await db.transaction(async (tx) => {
    const sourceRes = await tx.query<{
      id: string;
      title: string;
      description: string | null;
      main_file_id: string | null;
      compiler: ProjectView["compiler"];
      texlive_image_version: string;
      status: ProjectView["status"];
    }>(
      `SELECT id, title, description, main_file_id, compiler, texlive_image_version, status
       FROM projects WHERE id = $1`,
      [sourceProjectId],
    );
    const source = sourceRes.rows[0];
    if (!source || source.status !== "active") {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }

    const title = customTitle
      ? validateProjectTitle(customTitle)
      : validateProjectTitle(
          source.title.startsWith("Copy of ") ? source.title : `Copy of ${source.title}`,
        );

    const newProjectId = randomUUID();

    const newProjResult = await tx.query<{
      id: string;
      owner_id: string;
      title: string;
      description: string | null;
      compiler: ProjectView["compiler"];
      status: ProjectView["status"];
      current_revision: number;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO projects (id, owner_id, title, description, compiler, texlive_image_version, status, current_revision)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', 0)
       RETURNING id, owner_id, title, description, compiler, status, current_revision, created_at, updated_at`,
      [
        newProjectId,
        targetUserId,
        title,
        source.description,
        source.compiler,
        source.texlive_image_version,
      ],
    );

    const nodesRes = await tx.query<{
      id: string;
      parent_id: string | null;
      name: string;
      kind: string;
      mime: string;
      content_kind: string;
      size_bytes: number;
      blob_key: string | null;
    }>(
      `SELECT id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key
       FROM project_nodes
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY (parent_id IS NULL) DESC`,
      [sourceProjectId],
    );

    const idMap = new Map<string, string>();
    for (const node of nodesRes.rows) {
      idMap.set(node.id, randomUUID());
    }

    for (const node of nodesRes.rows) {
      const newNodeId = idMap.get(node.id)!;
      const newParentId = node.parent_id ? (idMap.get(node.parent_id) ?? null) : null;

      await tx.query(
        `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newNodeId,
          newProjectId,
          newParentId,
          node.name,
          node.kind,
          node.mime,
          node.content_kind,
          node.size_bytes,
          node.blob_key,
        ],
      );

      if (node.kind === "FILE" && node.content_kind === "TEXT") {
        await tx.query(
          `INSERT INTO text_documents (file_id, project_id, last_persisted_seq)
           VALUES ($1, $2, 0)`,
          [newNodeId, newProjectId],
        );
      }
    }

    let newMainFileId: string | null = null;
    if (source.main_file_id && idMap.has(source.main_file_id)) {
      newMainFileId = idMap.get(source.main_file_id)!;
      await tx.query(`UPDATE projects SET main_file_id = $1 WHERE id = $2`, [
        newMainFileId,
        newProjectId,
      ]);
    }

    const row = newProjResult.rows[0]!;
    return {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      description: row.description,
      mainFileId: newMainFileId,
      compiler: row.compiler,
      status: row.status,
      currentRevision: Number(row.current_revision),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  });
}
