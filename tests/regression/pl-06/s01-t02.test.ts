import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../../packages/db/src/client.js";

loadEnvFile(".env");

describe("PL-06 Relational constraints and migrations (S01-T02)", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("rejects invalid compiler values in projects", async () => {
    const ownerId = randomUUID();
    const projId = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);

    await expect(
      db.query(
        `INSERT INTO projects (id, owner_id, title, compiler) VALUES ($1, $2, 'Test', 'invalid_compiler')`,
        [projId, ownerId],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  it("rejects negative revision counter in projects", async () => {
    const ownerId = randomUUID();
    const projId = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);

    await expect(
      db.query(
        `INSERT INTO projects (id, owner_id, title, current_revision) VALUES ($1, $2, 'Test', -1)`,
        [projId, ownerId],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  it("rejects invalid role in project_members", async () => {
    const ownerId = randomUUID();
    const memberId = randomUUID();
    const projId = randomUUID();

    await db.query(
      `INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        ownerId,
        `owner-${ownerId.slice(0, 8)}@test.com`,
        "Owner",
        memberId,
        `mem-${memberId.slice(0, 8)}@test.com`,
        "Member",
      ],
    );

    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Test Proj')`, [
      projId,
      ownerId,
    ]);

    await expect(
      db.query(
        `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'SUPERUSER')`,
        [projId, memberId],
      ),
    ).rejects.toThrow(PersistenceError);
  });
});
