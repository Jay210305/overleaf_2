import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseClient } from "../../packages/db/src/client.js";

/** Keep parallel S06 test suites from applying the compile migration concurrently. */
export async function applyCompileMigrations(db: DatabaseClient): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(2060101)");
    await tx.query(
      readFileSync(
        resolve(import.meta.dirname, "../../packages/db/migrations/0008-compile-jobs.sql"),
        "utf8",
      ),
    );
  });
}
