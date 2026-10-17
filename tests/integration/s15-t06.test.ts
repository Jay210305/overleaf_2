import { describe, expect, it } from "vitest";
import { executeAutomatedRestore, verifyBackupIntegrity } from "../../infra/scripts/backup-restore.js";
import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";

describe("S15-T06: Automate complete backup and restore integration", () => {
  it("fails fast with clear error message when backup integrity check discovers missing blobs", async () => {
    // Mock db and storage where a blob is missing
    const mockDb = {
      query: async (queryText: string) => {
        if (queryText.includes("FROM project_revisions")) {
          return { rows: [{ manifest_key: "manifests/p1/rev1.json" }] } as unknown as Awaited<ReturnType<DatabaseClient["query"]>>;
        }
        return { rows: [] } as unknown as Awaited<ReturnType<DatabaseClient["query"]>>;
      },
    } as unknown as DatabaseClient;

    const mockStorage: Partial<StorageAdapter> = {
      get: async (key: string) => {
        const error = new Error(`Blob not found: ${key}`);
        error.name = "NoSuchKey";
        throw error;
      },
    };

    const integrity = await verifyBackupIntegrity({
      db: mockDb as DatabaseClient,
      storage: mockStorage as StorageAdapter,
    });

    expect(integrity.intact).toBe(false);
    expect(integrity.missingBlobs).toContain("manifests/p1/rev1.json");

    await expect(
      executeAutomatedRestore({
        db: mockDb as DatabaseClient,
        storage: mockStorage as StorageAdapter,
        backupDir: "/tmp/non-existent-dir",
      }),
    ).rejects.toThrow();
  });
});
