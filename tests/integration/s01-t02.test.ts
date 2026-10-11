import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../packages/db/src/client.js";

loadEnvFile(".env");

const root = resolve(import.meta.dirname, "../..");
const coreMigration = readFileSync(resolve(root, "packages/db/migrations/0001-core.sql"), "utf8");

describe("S01-T02 SQL migrations and constraints", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
    // Apply fresh migration
    await db.query(coreMigration);
  });

  afterAll(async () => {
    await db.close();
  });

  it("applies core migration idempotently", async () => {
    // Re-applying migration should succeed without error
    await expect(db.query(coreMigration)).resolves.toBeDefined();
  });

  it("fails when attempting cross-project parent relationship", async () => {
    const ownerId = randomUUID();
    const projA = randomUUID();
    const projB = randomUUID();
    const nodeA = randomUUID();
    const nodeB = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);

    await db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Proj A'), ($3, $2, 'Proj B')`,
      [projA, ownerId, projB],
    );

    // Node A in Project A
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'folder_a', 'FOLDER', 'application/x-directory', 'TEXT')`,
      [nodeA, projA],
    );

    // Node B in Project B trying to reference Node A in Project A as parent
    await expect(
      db.query(
        `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
         VALUES ($1, $2, $3, 'file_b.tex', 'FILE', 'application/x-tex', 'TEXT')`,
        [nodeB, projB, nodeA],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  it("fails when creating duplicate active names under the same parent", async () => {
    const ownerId = randomUUID();
    const projId = randomUUID();
    const parentId = randomUUID();
    const file1 = randomUUID();
    const file2 = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);

    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Proj Sibling')`, [
      projId,
      ownerId,
    ]);

    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'src', 'FOLDER', 'application/x-directory', 'TEXT')`,
      [parentId, projId],
    );

    // Insert first child
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, $3, 'main.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [file1, projId, parentId],
    );

    // Insert second child with duplicate name
    await expect(
      db.query(
        `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
         VALUES ($1, $2, $3, 'main.tex', 'FILE', 'application/x-tex', 'TEXT')`,
        [file2, projId, parentId],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  it("fails when creating duplicate active names at root (null parent)", async () => {
    const ownerId = randomUUID();
    const projId = randomUUID();
    const root1 = randomUUID();
    const root2 = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);

    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Proj Root')`, [
      projId,
      ownerId,
    ]);

    // Insert first root
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'root.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [root1, projId],
    );

    // Insert second root with duplicate name
    await expect(
      db.query(
        `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
         VALUES ($1, $2, NULL, 'root.tex', 'FILE', 'application/x-tex', 'TEXT')`,
        [root2, projId],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  it("fails when attempting to assign a foreign-project node as main_file_id", async () => {
    const ownerId = randomUUID();
    const projA = randomUUID();
    const projB = randomUUID();
    const nodeB = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-mf-${ownerId.slice(0, 8)}@test.com`,
      "MainFile Test Owner",
    ]);

    await db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Proj A'), ($3, $2, 'Proj B')`,
      [projA, ownerId, projB],
    );

    // Node B is in Project B
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'main_b.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [nodeB, projB],
    );

    // Attempting to set Project A's main_file_id to Node B (from Project B) must fail
    await expect(
      db.query(`UPDATE projects SET main_file_id = $1 WHERE id = $2`, [nodeB, projA]),
    ).rejects.toThrow(PersistenceError);

    // Creating Node A in Project A and setting main_file_id should succeed
    const nodeA = randomUUID();
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'main_a.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [nodeA, projA],
    );

    await expect(
      db.query(`UPDATE projects SET main_file_id = $1 WHERE id = $2`, [nodeA, projA]),
    ).resolves.toBeDefined();
  });

  it("fails when attempting to create text_documents with mismatched project_id", async () => {
    const ownerId = randomUUID();
    const projA = randomUUID();
    const projB = randomUUID();
    const nodeA = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-td-${ownerId.slice(0, 8)}@test.com`,
      "TextDoc Test Owner",
    ]);

    await db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Proj A'), ($3, $2, 'Proj B')`,
      [projA, ownerId, projB],
    );

    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'doc_a.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [nodeA, projA],
    );

    // Attempting to insert text_documents with file_id from Proj A but project_id Proj B
    await expect(
      db.query(`INSERT INTO text_documents (file_id, project_id) VALUES ($1, $2)`, [nodeA, projB]),
    ).rejects.toThrow(PersistenceError);

    // Same project succeeds
    await expect(
      db.query(`INSERT INTO text_documents (file_id, project_id) VALUES ($1, $2)`, [nodeA, projA]),
    ).resolves.toBeDefined();
  });
});
