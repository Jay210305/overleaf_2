import { loadEnvFile } from "node:process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../packages/db/src/client.js";
import {
  seedDevelopment,
  DEV_USERS,
  DEV_PROJECTS,
  DEV_TEMPLATES,
} from "../../packages/db/seeds/development.js";
import {
  buildUserFixture,
  insertUser,
  buildProjectFixture,
  insertProject,
  insertMember,
  buildNodeFixture,
  insertNode,
} from "../../packages/test-utils/src/factories.js";

loadEnvFile(".env");

describe("S01-T06 Isolated seeds and fixture factories", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("seeds 4 users with distinct roles, 3 projects, and 2 templates in development/test", async () => {
    await seedDevelopment(db);

    // Verify 4 users
    const usersRes = await db.query(
      `SELECT id, email_normalized, display_name FROM users WHERE id = ANY($1)`,
      [DEV_USERS.map((u) => u.id)],
    );
    expect(usersRes.rows).toHaveLength(4);

    // Verify 3 projects
    const projRes = await db.query(`SELECT id, owner_id, title FROM projects WHERE id = ANY($1)`, [
      DEV_PROJECTS.map((p) => p.id),
    ]);
    expect(projRes.rows).toHaveLength(3);

    // Verify 2 templates
    const tmplRes = await db.query(`SELECT id, title, category FROM templates WHERE id = ANY($1)`, [
      DEV_TEMPLATES.map((t) => t.id),
    ]);
    expect(tmplRes.rows).toHaveLength(2);

    // Verify all 4 roles exist in project_members
    const membersRes = await db.query(
      `SELECT DISTINCT role FROM project_members WHERE project_id = ANY($1)`,
      [DEV_PROJECTS.map((p) => p.id)],
    );
    const roles = membersRes.rows.map((r) => (r as { role: string }).role).sort();
    expect(roles).toEqual(["EDITOR", "OWNER", "REVIEWER", "VIEWER"]);
  });

  it("is idempotent when run repeatedly", async () => {
    await expect(seedDevelopment(db)).resolves.not.toThrow();
    await expect(seedDevelopment(db)).resolves.not.toThrow();
  });

  it("refuses to run seed in production environment", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await expect(seedDevelopment(db)).rejects.toThrow(
        "Production seed refuses fixed credentials",
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it("creates custom fixtures with factory helpers", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);

    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    await insertMember(db, project.id, user.id, "OWNER");

    const rootNode = buildNodeFixture(project.id, {
      name: "root-file.tex",
      parentId: null,
    });
    await insertNode(db, rootNode);

    const check = await db.query(`SELECT id, name FROM project_nodes WHERE id = $1`, [rootNode.id]);
    expect(check.rows).toHaveLength(1);
    expect(check.rows[0]!.name).toBe("root-file.tex");
  });

  it("fails when inserting a duplicate null-parent root node name", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);

    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const root1 = buildNodeFixture(project.id, {
      name: "main.tex",
      parentId: null,
    });
    await insertNode(db, root1);

    const root2 = buildNodeFixture(project.id, {
      name: "main.tex",
      parentId: null,
    });
    await expect(insertNode(db, root2)).rejects.toThrow(PersistenceError);
  });

  it("fails when inserting a node with a non-existent foreign parent id", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);

    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const orphanNode = buildNodeFixture(project.id, {
      name: "child.tex",
      parentId: "99999999-9999-4000-8000-000000000099",
    });
    await expect(insertNode(db, orphanNode)).rejects.toThrow(PersistenceError);
  });
});
