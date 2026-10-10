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

describe("S01-T07 Constraints rollback and naming races", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("ensures concurrent creation of same-name nodes under same parent leaves exactly one active node", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);
    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const folder = buildNodeFixture(project.id, {
      name: "chapters",
      kind: "FOLDER",
      parentId: null,
    });
    await insertNode(db, folder);

    const child1 = buildNodeFixture(project.id, {
      name: "intro.tex",
      kind: "FILE",
      parentId: folder.id,
    });
    const child2 = buildNodeFixture(project.id, {
      name: "intro.tex",
      kind: "FILE",
      parentId: folder.id,
    });

    const results = await Promise.allSettled([insertNode(db, child1), insertNode(db, child2)]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const found = await db.query(
      `SELECT id FROM project_nodes WHERE project_id = $1 AND parent_id = $2 AND name = $3 AND deleted_at IS NULL`,
      [project.id, folder.id, "intro.tex"],
    );
    expect(found.rows).toHaveLength(1);
  });

  it("rejects non-existent foreign parent ID", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);
    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const orphan = buildNodeFixture(project.id, {
      name: "orphan.tex",
      parentId: "00000000-0000-4000-8000-000000000000",
    });

    await expect(insertNode(db, orphan)).rejects.toThrow(PersistenceError);
  });

  it("rejects duplicate null-parent root names", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);
    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const rootA = buildNodeFixture(project.id, { name: "README.md", parentId: null });
    const rootB = buildNodeFixture(project.id, { name: "README.md", parentId: null });

    await insertNode(db, rootA);
    await expect(insertNode(db, rootB)).rejects.toThrow(PersistenceError);
  });

  it("preserves state on transaction failure (atomic rollback)", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);
    const project = buildProjectFixture(user.id);

    await expect(
      db.transaction(async (tx) => {
        await tx.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Temp')`, [
          project.id,
          user.id,
        ]);
        // Force error by violating foreign key constraint
        await tx.query(
          `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
           VALUES (gen_random_uuid(), $1, '11111111-1111-4000-8000-111111111111', 'bad.tex', 'FILE', 'text/plain', 'TEXT')`,
          [project.id],
        );
      }),
    ).rejects.toThrow(PersistenceError);

    const check = await db.query(`SELECT id FROM projects WHERE id = $1`, [project.id]);
    expect(check.rows).toHaveLength(0);
  });
});
