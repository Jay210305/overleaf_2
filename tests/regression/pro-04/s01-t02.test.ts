import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../../packages/db/src/client.js";

loadEnvFile(".env");

describe("PRO-04 Tree operations and uniqueness invariants (S01-T02)", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
  });

  afterAll(async () => {
    await db.close();
  });

  it("allows reusing name after logical deletion (deleted_at is set)", async () => {
    const ownerId = randomUUID();
    const projId = randomUUID();
    const node1 = randomUUID();
    const node2 = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);

    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Test Proj')`, [
      projId,
      ownerId,
    ]);

    // Insert active node
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'reused.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [node1, projId],
    );

    // Soft delete the first node
    await db.query(`UPDATE project_nodes SET deleted_at = NOW() WHERE id = $1`, [node1]);

    // Inserting a new active node with the same name should now succeed!
    const result = await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'reused.tex', 'FILE', 'application/x-tex', 'TEXT')
       RETURNING id`,
      [node2, projId],
    );

    expect(result.rows).toHaveLength(1);
  });
});
