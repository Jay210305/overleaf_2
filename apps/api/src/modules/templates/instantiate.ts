import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import type { DatabaseClient } from "@latex-collab/db";
import { validateProjectTitle } from "../projects/validation.js";
import type { InternalTemplate } from "./catalog.js";

/**
 * Instantiates one internal template as a member-free project owned solely
 * by the requesting actor. Tree nodes, canonical Yjs updates and the main
 * file pointer are written in one transaction; no project members, shares
 * or external authorization are copied because templates carry none.
 */
export async function instantiateTemplate(
  db: DatabaseClient,
  actorId: string,
  template: InternalTemplate,
  title: string,
): Promise<{ projectId: string; mainFileId: string }> {
  const cleanTitle = validateProjectTitle(title);
  return await db.transaction(async (tx) => {
    const projectId = randomUUID();
    await tx.query(
      `INSERT INTO projects (id, owner_id, title, description, compiler, status, current_revision, main_file_id)
       VALUES ($1, $2, $3, NULL, 'pdflatex', 'active', 0, NULL)`,
      [projectId, actorId, cleanTitle],
    );
    const dirPaths = new Set<string>();
    for (const file of template.filesWithContent) {
      const parts = file.path.split("/").slice(0, -1);
      for (let depth = 1; depth <= parts.length; depth++) {
        dirPaths.add(parts.slice(0, depth).join("/"));
      }
    }
    const nodeIds = new Map<string, string>();
    const sortedDirs = [...dirPaths].sort(
      (left, right) => left.split("/").length - right.split("/").length,
    );
    for (const dirPath of sortedDirs) {
      const parentPath = dirPath.includes("/") ? dirPath.slice(0, dirPath.lastIndexOf("/")) : null;
      const nodeId = randomUUID();
      await tx.query(
        `INSERT INTO project_nodes
           (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
         VALUES ($1, $2, $3, $4, 'FOLDER', 'inode/directory', 'TEXT', 0, NULL)`,
        [
          nodeId,
          projectId,
          parentPath === null ? null : nodeIds.get(parentPath),
          dirPath.slice(dirPath.lastIndexOf("/") + 1),
        ],
      );
      nodeIds.set(dirPath, nodeId);
    }
    let mainFileId: string | null = null;
    for (const file of template.filesWithContent) {
      const parentPath = file.path.includes("/")
        ? file.path.slice(0, file.path.lastIndexOf("/"))
        : null;
      const nodeId = randomUUID();
      const sizeBytes = Buffer.byteLength(file.content, "utf8");
      await tx.query(
        `INSERT INTO project_nodes
           (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
         VALUES ($1, $2, $3, $4, 'FILE', $5, 'TEXT', $6, NULL)`,
        [
          nodeId,
          projectId,
          parentPath === null ? null : nodeIds.get(parentPath),
          file.path.slice(file.path.lastIndexOf("/") + 1),
          file.mime,
          sizeBytes,
        ],
      );
      const doc = new Y.Doc();
      try {
        doc.getText("content").insert(0, file.content);
        const update = Buffer.from(Y.encodeStateAsUpdate(doc));
        await tx.query(
          "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
          [nodeId, projectId],
        );
        await tx.query(
          `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes, created_at)
           VALUES ($1, $2, 1, $3, $4, NOW())`,
          [randomUUID(), nodeId, actorId, update],
        );
      } finally {
        doc.destroy();
      }
      nodeIds.set(file.path, nodeId);
      if (file.path === template.mainPath) mainFileId = nodeId;
    }
    if (!mainFileId) throw new Error("Template has no main file");
    await tx.query("UPDATE projects SET main_file_id = $1 WHERE id = $2", [mainFileId, projectId]);
    return { projectId, mainFileId };
  });
}
