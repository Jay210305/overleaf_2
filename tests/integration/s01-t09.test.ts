import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../packages/db/src/client.js";

loadEnvFile(".env");

const root = resolve(import.meta.dirname, "../..");
const supportMigration = readFileSync(
  resolve(root, "packages/db/migrations/0002-support.sql"),
  "utf8",
);

describe("S01-T09 Support entity migrations and constraints", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
    await db.query(supportMigration);
  });

  afterAll(async () => {
    await db.close();
  });

  it("applies support migration idempotently", async () => {
    await expect(db.query(supportMigration)).resolves.toBeDefined();
  });

  it("enforces crdt_snapshots storage constraint (exactly one of state_bytes or blob_key)", async () => {
    const ownerId = randomUUID();
    const projId = randomUUID();
    const fileId = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);
    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Proj')`, [
      projId,
      ownerId,
    ]);
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'doc.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [fileId, projId],
    );
    await db.query(`INSERT INTO text_documents (file_id, project_id) VALUES ($1, $2)`, [
      fileId,
      projId,
    ]);

    // Valid: state_bytes only
    await expect(
      db.query(
        `INSERT INTO crdt_snapshots (id, file_id, upto_seq, state_bytes, blob_key, content_sha256)
         VALUES ($1, $2, 1, $3, NULL, 'hash1')`,
        [randomUUID(), fileId, Buffer.from("state")],
      ),
    ).resolves.toBeDefined();

    // Valid: blob_key only
    await expect(
      db.query(
        `INSERT INTO crdt_snapshots (id, file_id, upto_seq, state_bytes, blob_key, content_sha256)
         VALUES ($1, $2, 2, NULL, 'blob/key', 'hash2')`,
        [randomUUID(), fileId],
      ),
    ).resolves.toBeDefined();

    // Invalid: both state_bytes AND blob_key present
    await expect(
      db.query(
        `INSERT INTO crdt_snapshots (id, file_id, upto_seq, state_bytes, blob_key, content_sha256)
         VALUES ($1, $2, 3, $3, 'blob/key', 'hash3')`,
        [randomUUID(), fileId, Buffer.from("state")],
      ),
    ).rejects.toThrow(PersistenceError);

    // Invalid: neither state_bytes NOR blob_key present
    await expect(
      db.query(
        `INSERT INTO crdt_snapshots (id, file_id, upto_seq, state_bytes, blob_key, content_sha256)
         VALUES ($1, $2, 4, NULL, NULL, 'hash4')`,
        [randomUUID(), fileId],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  it("enforces status constraints on comments and suggestions", async () => {
    const ownerId = randomUUID();
    const projId = randomUUID();
    const fileId = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-${ownerId.slice(0, 8)}@test.com`,
      "Test Owner",
    ]);
    await db.query(`INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Proj')`, [
      projId,
      ownerId,
    ]);
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'doc2.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [fileId, projId],
    );

    // Invalid comment status
    await expect(
      db.query(
        `INSERT INTO comments (id, project_id, file_id, created_by, anchor_start_json, anchor_end_json, body, status)
         VALUES ($1, $2, $3, 'user', '{}', '{}', 'test body', 'invalid_status')`,
        [randomUUID(), projId, fileId],
      ),
    ).rejects.toThrow(PersistenceError);

    // Invalid suggestion status
    await expect(
      db.query(
        `INSERT INTO suggestions (id, project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
         VALUES ($1, $2, $3, $4, 'insert', '1', '{}', 'hash', 'new text', 'invalid_status')`,
        [randomUUID(), projId, fileId, ownerId],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  it("enforces cross-project consistency for comments and suggestions", async () => {
    const ownerId = randomUUID();
    const projA = randomUUID();
    const projB = randomUUID();
    const fileA = randomUUID();

    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-cs-${ownerId.slice(0, 8)}@test.com`,
      "Comment Test Owner",
    ]);
    await db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Proj A'), ($3, $2, 'Proj B')`,
      [projA, ownerId, projB],
    );
    await db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'doc_a.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [fileA, projA],
    );

    // Cross-project comment (fileA in projA, but comment assigned to projB)
    await expect(
      db.query(
        `INSERT INTO comments (id, project_id, file_id, created_by, anchor_start_json, anchor_end_json, body, status)
         VALUES ($1, $2, $3, 'user', '{}', '{}', 'test body', 'open')`,
        [randomUUID(), projB, fileA],
      ),
    ).rejects.toThrow(PersistenceError);

    // Cross-project suggestion
    await expect(
      db.query(
        `INSERT INTO suggestions (id, project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
         VALUES ($1, $2, $3, $4, 'insert', '1', '{}', 'hash', 'new text', 'pending')`,
        [randomUUID(), projB, fileA, ownerId],
      ),
    ).rejects.toThrow(PersistenceError);

    // Valid same-project comment and suggestion
    await expect(
      db.query(
        `INSERT INTO comments (id, project_id, file_id, created_by, anchor_start_json, anchor_end_json, body, status)
         VALUES ($1, $2, $3, 'user', '{}', '{}', 'valid body', 'open')`,
        [randomUUID(), projA, fileA],
      ),
    ).resolves.toBeDefined();

    await expect(
      db.query(
        `INSERT INTO suggestions (id, project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
         VALUES ($1, $2, $3, $4, 'insert', '1', '{}', 'hash', 'valid text', 'pending')`,
        [randomUUID(), projA, fileA, ownerId],
      ),
    ).resolves.toBeDefined();
  });
});
