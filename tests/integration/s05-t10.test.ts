import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import * as Y from "yjs";
import type { QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { afterAll, beforeAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import {
  readArchiveForApply,
  validateZipArchive,
  ZipValidationError,
} from "../../apps/jobs/src/imports/zip.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyImportMigrations } from "../helpers/import-migrations.js";
import { buildZip, minimalPng, sha256Hex } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");

describe("S05-T10 validated archive materialization", () => {
  it("reopens nested source and binary entries with their exact validated bytes", async () => {
    const source = Buffer.from("\\documentclass{article}\n\\begin{document}Hi\\end{document}\n");
    const image = minimalPng();
    const archive = buildZip([
      { name: "main.tex", data: source },
      { name: "images/chart.png", data: image },
    ]);
    const manifest = await validateZipArchive(archive);

    const files = await readArchiveForApply(archive, manifest);

    expect([...files.keys()].sort()).toEqual(["images/chart.png", "main.tex"]);
    expect(files.get("main.tex")).toEqual(source);
    expect(files.get("images/chart.png")).toEqual(image);
    expect(manifest.entries.find((entry) => entry.path === "main.tex")).toMatchObject({
      sha256: sha256Hex(source),
    });
  });

  it("rejects changed archive bytes and a tampered validated manifest", async () => {
    const archive = buildZip([{ name: "main.tex", data: "Original\n" }]);
    const manifest = await validateZipArchive(archive);
    const changed = buildZip([{ name: "main.tex", data: "Modified\n" }]);
    await expect(readArchiveForApply(changed, manifest)).rejects.toBeInstanceOf(ZipValidationError);
    const tampered = structuredClone(manifest);
    const file = tampered.entries.find((entry) => entry.path === "main.tex");
    if (!file || file.kind === "DIRECTORY") throw new Error("missing fixture file");
    file.sha256 = "0".repeat(64);
    await expect(readArchiveForApply(archive, tampered)).rejects.toBeInstanceOf(ZipValidationError);
  });

  it("rejects a file used as an ancestor folder", async () => {
    const archive = buildZip([
      { name: "style.sty", data: "\\ProvidesPackage{style}\n" },
      { name: "style.sty/main.tex", data: "Nested\n" },
    ]);
    await expect(validateZipArchive(archive)).rejects.toMatchObject({ code: "UNSAFE_PATH" });
  });
});

describe("S05-T10 durable project and blob preparation", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let jobs: ImportJobRepository;
  let storage: S3StorageAdapter;
  let actorId: string;
  let cookie: string;
  const writtenKeys: string[] = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 8);
    const owner = await fixture.seed();
    actorId = owner.id;
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    jobs = new ImportJobRepository(fixture.db);
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  });

  afterAll(async () => {
    for (const key of writtenKeys) await storage.delete(key);
    if (fixture) await fixture.close();
  });

  async function validatedJob(archiveOverride?: Buffer) {
    const image = minimalPng();
    const source = Buffer.from("\\documentclass{article}\n\\begin{document}Hi\\end{document}\n");
    const archive =
      archiveOverride ??
      buildZip([
        { name: "main.tex", data: source },
        { name: "images/chart.png", data: image },
      ]);
    const manifest = await validateZipArchive(archive);
    const reserved = await jobs.reserve({
      actorId,
      idempotencyKey: randomUUID(),
      archiveSha256: sha256Hex(archive),
      archiveSize: archive.length,
      title: "Prepared import",
    });
    await fixture.db.query(
      `UPDATE import_jobs SET status = 'validated', manifest = $2::jsonb,
         manifest_version = 1 WHERE id = $1`,
      [reserved.job.id, JSON.stringify(manifest)],
    );
    return {
      jobId: reserved.job.id,
      archive,
      manifest,
      files: await readArchiveForApply(archive, manifest),
    };
  }

  async function stagedJob(archiveOverride?: Buffer) {
    const job = await validatedJob(archiveOverride);
    const row = await jobs.get(job.jobId);
    if (!row) throw new Error("missing import job");
    await storage.put(row.archiveKey, job.archive, "application/zip");
    writtenKeys.push(row.archiveKey);
    return job;
  }

  it("reserves one stable project ID without making a project visible", async () => {
    const { jobId } = await validatedJob();
    const first = await jobs.reserveProjectId(jobId);
    const second = await jobs.reserveProjectId(jobId);
    expect(first.pendingProjectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.pendingProjectId).toBe(first.pendingProjectId);
    expect(second.projectId).toBeNull();
    const project = await fixture.db.query("SELECT id FROM projects WHERE id = $1", [
      first.pendingProjectId,
    ]);
    expect(project.rows).toEqual([]);

    const response = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/imports/${jobId}`,
      headers: { origin, cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty("pendingProjectId");
    expect(response.json()).not.toHaveProperty("archiveKey");
  });

  it("retries verified binary writes at the same project key after a storage outage", async () => {
    const { jobId, files } = await validatedJob();
    const job = await jobs.reserveProjectId(jobId);
    const { prepareImportBlobs } = await import("../../apps/jobs/src/imports/apply-project.js");
    const outage = Object.create(storage) as S3StorageAdapter;
    outage.put = async () => {
      throw new Error("injected storage outage");
    };
    await expect(prepareImportBlobs(outage, job, files)).rejects.toThrow("injected storage outage");
    expect((await jobs.get(jobId))?.status).toBe("validated");
    const project = await fixture.db.query("SELECT id FROM projects WHERE id = $1", [
      job.pendingProjectId,
    ]);
    expect(project.rows).toEqual([]);

    const keys = await prepareImportBlobs(storage, job, files);
    expect([...keys.keys()]).toEqual(["images/chart.png"]);
    const key = keys.get("images/chart.png")!;
    writtenKeys.push(key);
    expect(key).toBe(
      `projects/${job.pendingProjectId}/blobs/${sha256Hex(files.get("images/chart.png")!)}`,
    );
    expect(await storage.getLimited(key, files.get("images/chart.png")!.length)).toEqual(
      files.get("images/chart.png"),
    );
    expect((await jobs.reserveProjectId(jobId)).pendingProjectId).toBe(job.pendingProjectId);
  });

  it("atomically creates a nested project with canonical text and a verified binary", async () => {
    const { jobId } = await stagedJob();
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    const done = await applyValidatedImport(fixture.db, storage, jobId);
    expect(done.status).toBe("succeeded");
    expect(done.projectId).toBe(done.pendingProjectId);
    const project = await fixture.db.query<{ main_file_id: string; owner_id: string }>(
      "SELECT main_file_id, owner_id FROM projects WHERE id = $1",
      [done.projectId],
    );
    expect(project.rows[0]?.owner_id).toBe(actorId);
    const nodes = await fixture.db.query<{
      id: string;
      parent_id: string | null;
      name: string;
      kind: string;
      blob_key: string | null;
    }>("SELECT id, parent_id, name, kind, blob_key FROM project_nodes WHERE project_id = $1", [
      done.projectId,
    ]);
    expect(nodes.rows.map((node) => `${node.kind}:${node.name}`).sort()).toEqual([
      "FILE:chart.png",
      "FILE:main.tex",
      "FOLDER:images",
    ]);
    const main = nodes.rows.find((node) => node.name === "main.tex")!;
    const folder = nodes.rows.find((node) => node.name === "images")!;
    const image = nodes.rows.find((node) => node.name === "chart.png")!;
    expect(project.rows[0]?.main_file_id).toBe(main.id);
    expect(image.parent_id).toBe(folder.id);
    expect(image.blob_key).toBe(`projects/${done.projectId}/blobs/${sha256Hex(minimalPng())}`);
    writtenKeys.push(image.blob_key!);
    const updates = await fixture.db.query<{ payload_bytes: Buffer; seq: string }>(
      "SELECT payload_bytes, seq FROM crdt_updates WHERE file_id = $1",
      [main.id],
    );
    expect(updates.rows).toHaveLength(1);
    expect(Number(updates.rows[0]?.seq)).toBe(1);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, updates.rows[0]!.payload_bytes);
    expect(doc.getText("content").toString()).toContain("\\begin{document}Hi");
    doc.destroy();
  });

  it("returns one project under concurrent and repeated apply calls", async () => {
    const { jobId } = await stagedJob();
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    const [first, second] = await Promise.all([
      applyValidatedImport(fixture.db, storage, jobId),
      applyValidatedImport(fixture.db, storage, jobId),
    ]);
    expect(first.projectId).toBe(second.projectId);
    expect((await applyValidatedImport(fixture.db, storage, jobId)).projectId).toBe(
      first.projectId,
    );
    const projects = await fixture.db.query("SELECT id FROM projects WHERE id = $1", [
      first.projectId,
    ]);
    expect(projects.rows).toHaveLength(1);
    const key = `projects/${first.projectId}/blobs/${sha256Hex(minimalPng())}`;
    writtenKeys.push(key);
  });

  it("leaves no visible project when stored archive bytes change", async () => {
    const { jobId } = await stagedJob();
    await jobs.reserveProjectId(jobId);
    const job = await jobs.get(jobId);
    await storage.put(
      job!.archiveKey,
      buildZip([{ name: "main.tex", data: "changed" }]),
      "application/zip",
    );
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    await expect(applyValidatedImport(fixture.db, storage, jobId)).rejects.toBeInstanceOf(
      ZipValidationError,
    );
    const after = await jobs.get(jobId);
    expect(after?.projectId).toBeNull();
    expect(after?.status).toBe("failed");
    const rows = await fixture.db.query("SELECT id FROM projects WHERE id = $1", [
      after?.pendingProjectId,
    ]);
    expect(rows.rows).toHaveLength(0);
  });

  it("rejects a manifest changed between archive verification and reservation", async () => {
    const { jobId } = await stagedJob();
    const tamperDb = Object.create(fixture.db) as typeof fixture.db;
    let changed = false;
    tamperDb.query = async <Row extends QueryResultRow = QueryResultRow>(
      sql: string,
      parameters?: readonly unknown[],
    ) => {
      if (!changed && sql.includes("SET pending_project_id")) {
        changed = true;
        const current = await jobs.get(jobId);
        const manifest = structuredClone(current!.manifest!);
        const main = manifest.entries.find((entry) => entry.path === "main.tex");
        if (!main || main.kind === "DIRECTORY") throw new Error("missing main.tex");
        main.sha256 = "0".repeat(64);
        await fixture.db.query("UPDATE import_jobs SET manifest = $2::jsonb WHERE id = $1", [
          jobId,
          JSON.stringify(manifest),
        ]);
      }
      return fixture.db.query<Row>(sql, parameters);
    };
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    await expect(applyValidatedImport(tamperDb, storage, jobId)).rejects.toMatchObject({
      code: "INVALID_ARCHIVE",
    });
    const job = await jobs.get(jobId);
    expect(job?.status).toBe("failed");
    expect(
      (await fixture.db.query("SELECT id FROM projects WHERE id = $1", [job?.pendingProjectId]))
        .rows,
    ).toHaveLength(0);
  });

  it("rejects a persisted manifest version inconsistent with the validated archive", async () => {
    const { jobId } = await stagedJob();
    const reserved = await jobs.reserveProjectId(jobId);
    await fixture.db.query("UPDATE import_jobs SET manifest_version = 2 WHERE id = $1", [jobId]);
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    await expect(applyValidatedImport(fixture.db, storage, jobId)).rejects.toMatchObject({
      code: "INVALID_ARCHIVE",
    });
    expect((await jobs.get(jobId))?.status).toBe("failed");
    expect(
      (await fixture.db.query("SELECT id FROM projects WHERE id = $1", [reserved.pendingProjectId]))
        .rows,
    ).toHaveLength(0);
  });

  it.each([
    ["unsafe path", buildZip([{ name: "../escape.tex", data: "escape" }]), "UNSAFE_PATH"],
    [
      "decompression limit",
      buildZip([{ name: "main.tex", data: "A".repeat(101 * 1024 * 1024), method: 8 }]),
      "LIMIT_EXCEEDED",
    ],
  ] as const)(
    "rejects a replaced %s archive without a project",
    async (_name, replacement, code) => {
      const { jobId } = await stagedJob();
      const reserved = await jobs.reserveProjectId(jobId);
      await storage.put(reserved.archiveKey, replacement, "application/zip");
      await fixture.db.query(
        "UPDATE import_jobs SET archive_sha256 = $2, archive_size = $3 WHERE id = $1",
        [jobId, sha256Hex(replacement), replacement.length],
      );
      const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
      await expect(applyValidatedImport(fixture.db, storage, jobId)).rejects.toMatchObject({
        code,
      });
      expect((await jobs.get(jobId))?.status).toBe("failed");
      expect(
        (
          await fixture.db.query("SELECT id FROM projects WHERE id = $1", [
            reserved.pendingProjectId,
          ])
        ).rows,
      ).toHaveLength(0);
    },
  );

  it("fails a missing server archive and leaves its reserved project invisible", async () => {
    const { jobId } = await stagedJob();
    const reserved = await jobs.reserveProjectId(jobId);
    await storage.delete(reserved.archiveKey);
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    await expect(applyValidatedImport(fixture.db, storage, jobId)).rejects.toMatchObject({
      code: "INVALID_ARCHIVE",
    });
    expect((await jobs.get(jobId))?.status).toBe("failed");
    expect(
      (await fixture.db.query("SELECT id FROM projects WHERE id = $1", [reserved.pendingProjectId]))
        .rows,
    ).toHaveLength(0);
  });

  it("sweeps a failed archive and its unreferenced prepared blob", async () => {
    const { jobId } = await stagedJob();
    const reserved = await jobs.reserveProjectId(jobId);
    const files = await readArchiveForApply(
      await storage.getLimited(reserved.archiveKey, reserved.archiveSize),
      reserved.manifest!,
    );
    const { prepareImportBlobs, applyValidatedImport, runImportApplyPass } =
      await import("../../apps/jobs/src/imports/apply-project.js");
    const blobKey = (await prepareImportBlobs(storage, reserved, files)).get("images/chart.png")!;
    writtenKeys.push(blobKey);
    await storage.put(
      reserved.archiveKey,
      buildZip([{ name: "main.tex", data: "changed" }]),
      "application/zip",
    );
    const oldest = await fixture.db.query<{ first: Date }>(
      "SELECT MIN(created_at) AS first FROM import_jobs WHERE status = 'failed' AND archive_swept = FALSE AND pending_project_id IS NOT NULL",
    );
    const first = oldest.rows[0]?.first?.getTime() ?? Date.now();
    await fixture.db.query("UPDATE import_jobs SET created_at = $2 WHERE id = $1", [
      jobId,
      new Date(first - 24 * 60 * 60_000),
    ]);
    await expect(applyValidatedImport(fixture.db, storage, jobId)).rejects.toBeInstanceOf(
      ZipValidationError,
    );
    await runImportApplyPass(fixture.db, storage, 1);
    expect((await jobs.get(jobId))?.archiveSwept).toBe(true);
    expect(await storage.head(reserved.archiveKey)).toBeNull();
    expect(await storage.head(blobKey)).toBeNull();
  });

  it("creates implicit folders and replays every imported text document", async () => {
    const archive = buildZip([
      { name: "chapters/intro.tex", data: "\\section{Intro}\n" },
      { name: "main.tex", data: "\\input{chapters/intro}\n" },
    ]);
    const { jobId } = await stagedJob(archive);
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    const done = await applyValidatedImport(fixture.db, storage, jobId);
    const nodes = await fixture.db.query<{ id: string; name: string; parent_id: string | null }>(
      "SELECT id, name, parent_id FROM project_nodes WHERE project_id = $1",
      [done.projectId],
    );
    const folder = nodes.rows.find((node) => node.name === "chapters")!;
    const intro = nodes.rows.find((node) => node.name === "intro.tex")!;
    expect(intro.parent_id).toBe(folder.id);
    const updates = await fixture.db.query<{ file_id: string; payload_bytes: Buffer }>(
      `SELECT u.file_id, u.payload_bytes FROM crdt_updates u
       JOIN project_nodes n ON n.id = u.file_id WHERE n.project_id = $1`,
      [done.projectId],
    );
    expect(updates.rows).toHaveLength(2);
    const replay = new Y.Doc();
    Y.applyUpdate(replay, updates.rows.find((row) => row.file_id === intro.id)!.payload_bytes);
    expect(replay.getText("content").toString()).toBe("\\section{Intro}\n");
    replay.destroy();
  });

  it("rolls back project rows on a SQL failure and retries with the reserved ID", async () => {
    const { jobId } = await stagedJob();
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    const faultDb = Object.create(fixture.db) as typeof fixture.db;
    faultDb.transaction = (work) =>
      fixture.db.transaction(async (tx) => {
        let inserted = false;
        return work({
          query: async <Row extends QueryResultRow = QueryResultRow>(
            sql: string,
            parameters?: readonly unknown[],
          ) => {
            if (inserted) throw new Error("injected SQL failure");
            const result = await tx.query<Row>(sql, parameters);
            if (sql.startsWith("INSERT INTO projects")) inserted = true;
            return result;
          },
        });
      });
    await expect(applyValidatedImport(faultDb, storage, jobId)).rejects.toThrow(
      "injected SQL failure",
    );
    const reserved = await jobs.get(jobId);
    expect(reserved?.status).toBe("validated");
    const visible = await fixture.db.query("SELECT id FROM projects WHERE id = $1", [
      reserved?.pendingProjectId,
    ]);
    expect(visible.rows).toHaveLength(0);
    const done = await applyValidatedImport(fixture.db, storage, jobId);
    expect(done.projectId).toBe(reserved?.pendingProjectId);
    writtenKeys.push(`projects/${done.projectId}/blobs/${sha256Hex(minimalPng())}`);
  });

  it("retries after a binary storage failure without exposing a project", async () => {
    const { jobId } = await stagedJob();
    const { applyValidatedImport } = await import("../../apps/jobs/src/imports/apply-project.js");
    const outage = Object.create(storage) as S3StorageAdapter;
    outage.put = async () => {
      throw new Error("injected storage outage");
    };
    await expect(applyValidatedImport(fixture.db, outage, jobId)).rejects.toThrow(
      "injected storage outage",
    );
    const job = await jobs.get(jobId);
    expect(job?.status).toBe("validated");
    expect(
      (await fixture.db.query("SELECT id FROM projects WHERE id = $1", [job?.pendingProjectId]))
        .rows,
    ).toHaveLength(0);
    const done = await applyValidatedImport(fixture.db, storage, jobId);
    expect(done.projectId).toBe(job?.pendingProjectId);
    writtenKeys.push(`projects/${done.projectId}/blobs/${sha256Hex(minimalPng())}`);
  });

  it("applies a staged job in the private bounded pass", async () => {
    const { jobId } = await stagedJob();
    const oldest = await fixture.db.query<{ first: Date }>(
      "SELECT MIN(created_at) AS first FROM import_jobs WHERE status = 'validated'",
    );
    const first = oldest.rows[0]!.first.getTime();
    await fixture.db.query("UPDATE import_jobs SET created_at = $2 WHERE id = $1", [
      jobId,
      new Date(first - 24 * 60 * 60_000),
    ]);
    const { runImportApplyPass } = await import("../../apps/jobs/src/imports/apply-project.js");
    const result = await runImportApplyPass(fixture.db, storage, 1);
    expect(result.succeeded).toBeGreaterThanOrEqual(1);
    const done = await jobs.get(jobId);
    expect(done?.status).toBe("succeeded");
    expect(done?.projectId).toBeTruthy();
    writtenKeys.push(`projects/${done?.projectId}/blobs/${sha256Hex(minimalPng())}`);
  });

  it("defers an unavailable old archive so a later validated job can progress", async () => {
    const unavailable = await stagedJob();
    const staged = await stagedJob();
    const earliest = await fixture.db.query<{ first: Date }>(
      "SELECT MIN(created_at) AS first FROM import_jobs WHERE status = 'validated'",
    );
    const first = earliest.rows[0]!.first.getTime();
    await fixture.db.query("UPDATE import_jobs SET created_at = $2 WHERE id = $1", [
      unavailable.jobId,
      new Date(first - 2 * 24 * 60 * 60_000),
    ]);
    await fixture.db.query("UPDATE import_jobs SET created_at = $2 WHERE id = $1", [
      staged.jobId,
      new Date(first - 24 * 60 * 60_000),
    ]);
    const { runImportApplyPass } = await import("../../apps/jobs/src/imports/apply-project.js");
    const outage = Object.create(storage) as S3StorageAdapter;
    const old = await jobs.get(unavailable.jobId);
    outage.head = (key) =>
      key === old?.archiveKey
        ? Promise.reject(new Error("injected storage outage"))
        : storage.head(key);
    expect((await runImportApplyPass(fixture.db, outage, 1)).retried).toBe(1);
    const next = await runImportApplyPass(fixture.db, outage, 1);
    expect(next.succeeded).toBe(1);
    const done = await jobs.get(staged.jobId);
    expect(done?.status).toBe("succeeded");
    writtenKeys.push(`projects/${done?.projectId}/blobs/${sha256Hex(minimalPng())}`);
    await fixture.db.query("DELETE FROM import_jobs WHERE id = $1", [unavailable.jobId]);
  });

  it("sweeps a succeeded archive after 14 days but retains its project blob", async () => {
    const { jobId } = await stagedJob();
    const { applyValidatedImport, sweepExpiredImportArchives } =
      await import("../../apps/jobs/src/imports/apply-project.js");
    const done = await applyValidatedImport(fixture.db, storage, jobId);
    const blobKey = `projects/${done.projectId}/blobs/${sha256Hex(minimalPng())}`;
    writtenKeys.push(blobKey);
    await fixture.db.query(
      "UPDATE import_jobs SET updated_at = NOW() - INTERVAL '15 days' WHERE id = $1",
      [jobId],
    );
    const swept = await sweepExpiredImportArchives(fixture.db, storage, new Date(), 100);
    expect(swept).toBeGreaterThanOrEqual(1);
    expect(await storage.head(done.archiveKey)).toBeNull();
    expect(await storage.getLimited(blobKey, minimalPng().length)).toEqual(minimalPng());
    expect((await jobs.get(jobId))?.archiveSwept).toBe(true);
  });
});
