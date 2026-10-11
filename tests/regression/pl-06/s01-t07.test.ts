import { loadEnvFile } from "node:process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../../packages/db/src/client.js";
import {
  buildUserFixture,
  buildProjectFixture,
  buildNodeFixture,
  insertUser,
  insertProject,
  insertNode,
} from "../../../packages/test-utils/src/factories.js";

loadEnvFile(".env");

describe("PL-06 Relational constraints and atomic rollback (S01-T07)", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("strictly rejects negative size_bytes on project nodes", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);
    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    const negativeNode = buildNodeFixture(project.id, {
      name: "negative.tex",
      sizeBytes: -50,
    });

    await expect(insertNode(db, negativeNode)).rejects.toThrow(PersistenceError);
  });

  it("enforces composite foreign key preventing nodes in different projects from sharing parent hierarchy", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);

    const project1 = buildProjectFixture(user.id);
    await insertProject(db, project1);

    const folder1 = buildNodeFixture(project1.id, {
      name: "folder1",
      kind: "FOLDER",
      parentId: null,
    });
    await insertNode(db, folder1);

    const project2 = buildProjectFixture(user.id);
    await insertProject(db, project2);

    // Node in project2 referencing folder1 in project1
    const invalidNode = buildNodeFixture(project2.id, {
      name: "child.tex",
      parentId: folder1.id,
    });

    await expect(insertNode(db, invalidNode)).rejects.toThrow(PersistenceError);
  });
});
