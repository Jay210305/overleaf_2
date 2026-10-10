import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../../packages/db/src/client.js";
import { ProjectRepository } from "../../../packages/db/src/repositories/projects.js";

loadEnvFile(".env");

describe("PRO-01 Projects listing and filtering (S01-T03)", () => {
  let db: DatabaseClient;
  let repo: ProjectRepository;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
    repo = new ProjectRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("filters shared projects accurately based on membership", async () => {
    const ownerId = randomUUID();
    const collaboratorId = randomUUID();
    const proj1 = randomUUID();
    const proj2 = randomUUID();

    await db.query(
      `INSERT INTO users (id, email_normalized, display_name) VALUES
       ($1, $2, 'Owner'),
       ($3, $4, 'Collab')`,
      [
        ownerId,
        `owner-${ownerId.slice(0, 8)}@test.com`,
        collaboratorId,
        `collab-${collaboratorId.slice(0, 8)}@test.com`,
      ],
    );

    // proj1 is owned by ownerId, shared with collaboratorId
    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Shared Proj')`, [
      proj1,
      ownerId,
    ]);
    await db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [proj1, collaboratorId],
    );

    // proj2 is owned by ownerId, NOT shared
    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Private Proj')`, [
      proj2,
      ownerId,
    ]);

    // Query shared projects for collaboratorId
    const shared = await repo.list(collaboratorId, {
      limit: 10,
      filter: "shared",
      order: "updatedAt",
    });

    expect(shared.items.map((p) => p.id)).toContain(proj1);
    expect(shared.items.map((p) => p.id)).not.toContain(proj2);
  });
});
