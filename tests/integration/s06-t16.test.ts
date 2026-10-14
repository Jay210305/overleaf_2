import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyCompileMigrations } from "../helpers/compile-migrations.js";
import { persistJobArtifacts } from "../../apps/jobs/src/compilation/artifacts.js";
import { createServer } from "../../apps/api/src/server.js";
import {
  createTrustedBackup,
  restoreTrustedBackup,
  verifyBackupIntegrity,
} from "../../infra/scripts/trusted-backup.js";

describe("S06-T16 Verify trusted-release backup and rollback integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let owner: { id: string; email: string };
  let projectId: string;
  let jobId: string;
  let pdfKey: string;
  let logKey: string;
  let tempBackupDir: string;

  const validPdfBytes = new TextEncoder().encode("%PDF-1.5\nBackup test authentic PDF\n%%EOF");
  const validLogBytes = new TextEncoder().encode("Transcript: backup test compilation completed.\n");

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);

    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });

    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      storage,
      origin,
      logger: false,
    });

    owner = await fixture.seed();
    const loginRes = await fixture.login(owner.email);
    const cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(loginRes.headers["x-csrf-token"]);

    // Create project
    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrf,
      },
      payload: {
        title: `Backup Test Project ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    expect(projRes.statusCode).toBe(201);
    projectId = projRes.json().id;

    // Enqueue compilation job
    const enqRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrf,
        "idempotency-key": `idemp-bk-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    jobId = enqRes.json().id;

    const artifactSet = await persistJobArtifacts({
      db: fixture.db,
      storage,
      projectId,
      jobId,
      sourceHash: "c".repeat(64),
      artifacts: [
        { name: "output.pdf", mime: "application/pdf", bytes: validPdfBytes, sha256: "hash-pdf" },
        { name: "compile.log", mime: "text/plain", bytes: validLogBytes, sha256: "hash-log" },
      ],
      retentionDays: 14,
    });

    pdfKey = artifactSet.pdfKey!;
    logKey = artifactSet.logKey!;

    // Ensure any structural revision manifests exist in storage
    const initialCheck = await verifyBackupIntegrity({ db: fixture.db, storage, projectId });
    for (const missingKey of initialCheck.missingBlobs) {
      await storage.put(
        missingKey,
        new TextEncoder().encode(missingKey.endsWith(".json") ? "{}" : ""),
        missingKey.endsWith(".json") ? "application/json" : "application/octet-stream",
      );
    }

    tempBackupDir = await mkdtemp(join(tmpdir(), "trusted-backup-test-"));
  });

  afterAll(async () => {
    if (tempBackupDir) {
      await rm(tempBackupDir, { recursive: true, force: true }).catch(() => {});
    }
    await fixture.close();
  });

  it("verifies initial database and storage state has zero missing blobs", async () => {
    const result = await verifyBackupIntegrity({ db: fixture.db, storage, projectId });
    expect(result.intact).toBe(true);
    expect(result.missingBlobs).toEqual([]);
    expect(result.verifiedBlobs).toBeGreaterThanOrEqual(2);
  });

  it("creates a trusted backup bundle containing database dump and referenced blobs", async () => {
    const result = await createTrustedBackup({
      db: fixture.db,
      storage,
      outputDir: tempBackupDir,
      projectId,
    });

    expect(result.manifest.version).toBe("1.0");
    expect(result.manifest.projectCount).toBeGreaterThanOrEqual(1);
    expect(result.manifest.artifactSetCount).toBeGreaterThanOrEqual(1);
    expect(result.manifest.blobs.some((b) => b.key === pdfKey)).toBe(true);
    expect(result.manifest.blobs.some((b) => b.key === logKey)).toBe(true);
  });

  it("detects missing blobs when storage is corrupted or deleted", async () => {
    // Delete PDF from storage to simulate data loss
    await storage.delete(pdfKey);

    const result = await verifyBackupIntegrity({ db: fixture.db, storage, projectId });
    expect(result.intact).toBe(false);
    expect(result.missingBlobs).toContain(pdfKey);
  });

  it("restores missing storage blobs from backup and validates complete recovery", async () => {
    const restoreResult = await restoreTrustedBackup({
      db: fixture.db,
      storage,
      backupDir: tempBackupDir,
      projectId,
    });

    expect(restoreResult.intact).toBe(true);
    expect(restoreResult.missingBlobs).toEqual([]);

    // Verify restored PDF in storage starts with %PDF-
    const restoredPdf = await storage.get(pdfKey);
    expect(restoredPdf).toBeDefined();
    expect(new TextDecoder().decode(restoredPdf!)).toContain("%PDF-1.5");
  });
});
