import { loadEnvFile } from "node:process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../../packages/db/src/client.js";
import {
  buildUserFixture,
  buildProjectFixture,
  buildNodeFixture,
  insertUser,
  insertProject,
  insertNode,
} from "../../../packages/test-utils/src/factories.js";

loadEnvFile(".env");

describe("PRO-04 Tree operations and naming race rejection (S01-T07)", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("resolves concurrent same-name sibling creation by accepting exactly one and rejecting the other", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);
    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const folder = buildNodeFixture(project.id, {
      name: "sections",
      kind: "FOLDER",
      parentId: null,
    });
    await insertNode(db, folder);

    const file1 = buildNodeFixture(project.id, {
      name: "sec1.tex",
      kind: "FILE",
      parentId: folder.id,
    });
    const file2 = buildNodeFixture(project.id, {
      name: "sec1.tex",
      kind: "FILE",
      parentId: folder.id,
    });

    const results = await Promise.allSettled([insertNode(db, file1), insertNode(db, file2)]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const errors = results.filter((r) => r.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(errors).toHaveLength(1);

    const nodes = await db.query(
      `SELECT id FROM project_nodes WHERE project_id = $1 AND parent_id = $2 AND name = $3 AND deleted_at IS NULL`,
      [project.id, folder.id, "sec1.tex"],
    );
    expect(nodes.rows).toHaveLength(1);
  });
});
