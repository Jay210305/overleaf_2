import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseClient } from "../../packages/db/src/client.js";

/** Keep parallel S05 suites from applying the same DDL at once. */
export async function applyImportMigrations(db: DatabaseClient, through: 6 | 7 = 6): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(2050312)");
    for (const migration of [
      "0006-import-jobs.sql",
      ...(through === 7 ? ["0007-import-upload-intents.sql"] : []),
    ]) {
      await tx.query(
        readFileSync(
          resolve(import.meta.dirname, `../../packages/db/migrations/${migration}`),
          "utf8",
        ),
      );
    }
  });
}
