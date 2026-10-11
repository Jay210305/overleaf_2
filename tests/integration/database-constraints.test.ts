import { loadEnvFile } from "node:process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../packages/db/src/client.js";
import {
  buildUserFixture,
  buildProjectFixture,
  buildNodeFixture,
  insertUser,
  insertProject,
  insertNode,
} from "../../packages/test-utils/src/factories.js";

loadEnvFile(".env");

describe("Database Constraints, Rollback, and Naming Races", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("yields exactly one active node when concurrent same-name creations race", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);
    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const node1 = buildNodeFixture(project.id, { name: "concurrent-doc.tex", parentId: null });
    const node2 = buildNodeFixture(project.id, { name: "concurrent-doc.tex", parentId: null });

    const results = await Promise.allSettled([insertNode(db, node1), insertNode(db, node2)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const activeNodes = await db.query(
      `SELECT id, name FROM project_nodes WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [project.id, "concurrent-doc.tex"],
    );
    expect(activeNodes.rows).toHaveLength(1);
  });

  it("enforces same-project parent FK and rejects cross-project foreign parents", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);

    const projectA = buildProjectFixture(user.id);
    await insertProject(db, projectA);

    const folderA = buildNodeFixture(projectA.id, {
      name: "src",
      kind: "FOLDER",
      parentId: null,
    });
    await insertNode(db, folderA);

    const projectB = buildProjectFixture(user.id);
    await insertProject(db, projectB);

    // Attempt to create a node in projectB whose parent is folderA (from projectA)
    const crossNode = buildNodeFixture(projectB.id, {
      name: "file.tex",
      kind: "FILE",
      parentId: folderA.id,
    });

    await expect(insertNode(db, crossNode)).rejects.toThrow(PersistenceError);
  });

  it("allows reusing a node name after soft-deletion", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);

    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const node1 = buildNodeFixture(project.id, { name: "reusable.tex", parentId: null });
    await insertNode(db, node1);

    // Soft delete node1
    await db.query(`UPDATE project_nodes SET deleted_at = NOW() WHERE id = $1`, [node1.id]);

    // Insert node2 with the same name
    const node2 = buildNodeFixture(project.id, { name: "reusable.tex", parentId: null });
    await expect(insertNode(db, node2)).resolves.not.toThrow();

    const allNodes = await db.query(
      `SELECT id, name, deleted_at FROM project_nodes WHERE project_id = $1 AND name = $2 ORDER BY deleted_at NULLS LAST`,
      [project.id, "reusable.tex"],
    );
    expect(allNodes.rows).toHaveLength(2);
    expect(allNodes.rows[0]!.deleted_at).not.toBeNull();
    expect(allNodes.rows[1]!.deleted_at).toBeNull();
  });

  it("rolls back all changes in a transaction when a constraint failure occurs", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);

    const project = buildProjectFixture(user.id);
    const validNode = buildNodeFixture(project.id, { name: "valid.tex", parentId: null });
    const invalidNode = buildNodeFixture(project.id, {
      name: "invalid.tex",
      parentId: null,
      kind: "INVALID_KIND" as unknown as "FILE",
    });

    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO projects (id, owner_id, title, compiler, status) VALUES ($1, $2, $3, $4, $5)`,
          [project.id, project.ownerId, project.title, project.compiler, project.status],
        );
        await tx.query(
          `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, size_bytes, content_kind)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            validNode.id,
            validNode.projectId,
            validNode.parentId,
            validNode.name,
            validNode.kind,
            validNode.mime,
            validNode.sizeBytes,
            validNode.contentKind,
          ],
        );
        // This query will violate kind check constraint
        await tx.query(
          `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, size_bytes, content_kind)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            invalidNode.id,
            invalidNode.projectId,
            invalidNode.parentId,
            invalidNode.name,
            invalidNode.kind,
            invalidNode.mime,
            invalidNode.sizeBytes,
            invalidNode.contentKind,
          ],
        );
      }),
    ).rejects.toThrow(PersistenceError);

    // Verify neither project nor validNode was persisted
    const projCheck = await db.query(`SELECT id FROM projects WHERE id = $1`, [project.id]);
    expect(projCheck.rows).toHaveLength(0);

    const nodeCheck = await db.query(`SELECT id FROM project_nodes WHERE id = $1`, [validNode.id]);
    expect(nodeCheck.rows).toHaveLength(0);
  });
});
