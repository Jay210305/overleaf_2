import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
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

  async function validatedJob() {
    const image = minimalPng();
    const source = Buffer.from("\\documentclass{article}\n\\begin{document}Hi\\end{document}\n");
    const archive = buildZip([
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
      manifest,
      files: await readArchiveForApply(archive, manifest),
    };
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
});
