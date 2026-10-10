import { loadEnvFile } from "node:process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../../packages/db/src/client.js";
import {
  buildUserFixture,
  buildProjectFixture,
  insertUser,
  insertProject,
} from "../../../packages/test-utils/src/factories.js";

loadEnvFile(".env");

describe("COL-03 Role Enforcement and Seed Role Coverage", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("permits only OWNER, EDITOR, REVIEWER, and VIEWER roles in project_members", async () => {
    const user = buildUserFixture();
    await insertUser(db, user);

    const project = buildProjectFixture(user.id);
    await insertProject(db, project);

    // Valid roles: OWNER, EDITOR, REVIEWER, VIEWER
    for (const validRole of ["OWNER", "EDITOR", "REVIEWER", "VIEWER"]) {
      const u = buildUserFixture();
      await insertUser(db, u);
      await expect(
        db.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`, [
          project.id,
          u.id,
          validRole,
        ]),
      ).resolves.not.toThrow();
    }

    // Invalid roles: ADMIN, GUEST, SUPERUSER
    for (const invalidRole of ["ADMIN", "GUEST", "SUPERUSER"]) {
      const u = buildUserFixture();
      await insertUser(db, u);
      await expect(
        db.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`, [
          project.id,
          u.id,
          invalidRole,
        ]),
      ).rejects.toThrow(PersistenceError);
    }
  });
});
