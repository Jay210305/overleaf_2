import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@latex-collab/db";
import type { ProjectView, CreateProjectInput } from "@latex-collab/contracts";
import { AuthError } from "../auth/errors.js";
import { validateProjectTitle } from "./validation.js";
import { cloneProject } from "./clone.js";

export { validateProjectTitle } from "./validation.js";

export async function createProject(
  db: DatabaseClient,
  ownerId: string,
  input: CreateProjectInput,
): Promise<ProjectView> {
  const title = validateProjectTitle(input.title);

  if (input.templateId) {
    const tplRes = await db.query<{ id: string }>(
      "SELECT id FROM projects WHERE id = $1 AND status = 'active'",
      [input.templateId],
    );
    if (!tplRes.rows[0]) {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }
    return await cloneProject(db, input.templateId, ownerId, title);
  }

  const description = input.description?.trim() ?? null;
  const compiler = input.compiler ?? "pdflatex";

  return await db.transaction(async (tx) => {
    const projId = randomUUID();
    const nodeId = randomUUID();

    const projResult = await tx.query<{
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
      `INSERT INTO projects (id, owner_id, title, description, compiler, status, current_revision)
       VALUES ($1, $2, $3, $4, $5, 'active', 0)
       RETURNING id, owner_id, title, description, compiler, status, current_revision, created_at, updated_at`,
      [projId, ownerId, title, description, compiler],
    );

    const mainTexContent =
      "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}\n";
    const sizeBytes = Buffer.byteLength(mainTexContent, "utf8");

    await tx.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
       VALUES ($1, $2, NULL, 'main.tex', 'FILE', 'application/x-tex', 'TEXT', $3)`,
      [nodeId, projId, sizeBytes],
    );

    await tx.query(
      `INSERT INTO text_documents (file_id, project_id, last_persisted_seq)
       VALUES ($1, $2, 0)`,
      [nodeId, projId],
    );

    await tx.query(`UPDATE projects SET main_file_id = $1 WHERE id = $2`, [nodeId, projId]);

    const row = projResult.rows[0]!;
    return {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      description: row.description,
      mainFileId: nodeId,
      compiler: row.compiler,
      status: row.status,
      currentRevision: Number(row.current_revision),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  });
}
