import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../../packages/db/src/client.js";

loadEnvFile(".env");

const root = resolve(import.meta.dirname, "../../..");
const supportMigration = readFileSync(
  resolve(root, "packages/db/migrations/0002-support.sql"),
  "utf8",
);

describe("PL-06 Support entity constraints (S01-T09)", () => {
  let db: DatabaseClient;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
    await db.query(supportMigration);
  });

  afterAll(async () => {
    await db.close();
  });

  it("rejects negative max_value on usage_quotas", async () => {
    const subjectId = randomUUID();
    await expect(
      db.query(
        `INSERT INTO usage_quotas (id, subject_type, subject_id, metric, max_value, "window")
         VALUES ($1, 'USER', $2, 'compile_minutes', -10, 'daily')`,
        [randomUUID(), subjectId],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  it("enforces unique (subject_type, subject_id, metric, window) on usage_quotas", async () => {
    const subjectId = randomUUID();
    const q1 = randomUUID();
    const q2 = randomUUID();

    await db.query(
      `INSERT INTO usage_quotas (id, subject_type, subject_id, metric, max_value, "window")
       VALUES ($1, 'USER', $2, 'storage_bytes', 1000000, 'monthly')`,
      [q1, subjectId],
    );

    await expect(
      db.query(
        `INSERT INTO usage_quotas (id, subject_type, subject_id, metric, max_value, "window")
         VALUES ($1, 'USER', $2, 'storage_bytes', 2000000, 'monthly')`,
        [q2, subjectId],
      ),
    ).rejects.toThrow(PersistenceError);
  });
});
