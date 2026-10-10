import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../../packages/db/src/client.js";

loadEnvFile(".env");

describe("PL-06 Relational constraints and rollback invariants (S01-T03)", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("preserves relational integrity when parent insertion fails within transaction", async () => {
    const ownerId = randomUUID();
    const projId = randomUUID();
    const fakeParentId = randomUUID();
    const nodeId = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);

    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Test Proj')`, [
      projId,
      ownerId,
    ]);

    await expect(
      db.transaction(async (tx) => {
        // Attempting to insert node with non-existent parent
        await tx.query(
          `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
           VALUES ($1, $2, $3, 'child.tex', 'FILE', 'application/x-tex', 'TEXT')`,
          [nodeId, projId, fakeParentId],
        );
      }),
    ).rejects.toThrow(PersistenceError);

    const check = await db.query(`SELECT id FROM project_nodes WHERE id = $1`, [nodeId]);
    expect(check.rows).toHaveLength(0);
  });
});
