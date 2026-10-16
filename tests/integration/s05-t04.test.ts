import { createHash, randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../packages/db/src/repositories/import-jobs.js";
import { RevisionsRepository } from "../../packages/db/src/repositories/revisions.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import {
  buildSourceZip,
  SourceExportError,
} from "../../apps/jobs/src/exports/zip.js";
import { applyValidatedImport } from "../../apps/jobs/src/imports/apply-project.js";
import {
  readArchiveForApply,
  validateZipArchive,
} from "../../apps/jobs/src/imports/zip.js";
import { createSessionFixture } from "../helpers/s02-session.js";
import { applyImportMigrations } from "../helpers/import-migrations.js";
import {
  buildImportArchive,
  importIntroTex,
  importMainTex,
  settleValidatedJob,
} from "../helpers/import-apply.js";
import { minimalPng } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");

describe("S05-T04 immutable source ZIP export", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let jobs: ImportJobRepository;
  let revisions: RevisionsRepository;
  let actorId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 9);
    const owner = await fixture.seed();
    actorId = owner.id;
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    jobs = new ImportJobRepository(fixture.db);
    revisions = new RevisionsRepository(fixture.db);
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  async function stageExportedProject(title: string): Promise<{ projectId: string; revisionNo: number }> {
    const settled = await settleValidatedJob(
      fixture.db,
      storage,
      jobs,
      actorId,
      title,
      buildImportArchive(),
    );
    const applied = await applyValidatedImport(fixture.db, storage, settled.job.id);
    const checkpoint = await revisions.createStructuralRevision({
      projectId: applied.projectId!,
      authorId: actorId,
      source: "manual",
      label: null,
    });
    return { projectId: applied.projectId!, revisionNo: checkpoint.revisionNo };
  }

  it("exports the frozen revision tree with exact bytes", async () => {
    const title = `S05-T04 export ${randomUUID()}`;
    const { projectId, revisionNo } = await stageExportedProject(title);
    const result = await buildSourceZip(fixture.db, storage, { projectId, actorId, revisionNo });
    expect(result.revisionNo).toBe(revisionNo);
    expect(result.files.map((file) => file.path).sort()).toEqual([
      "assets/fig.png",
      "chapters/intro.tex",
      "main.tex",
      "refs.bib",
    ]);
    const parsed = await validateZipArchive(result.bytes);
    expect(parsed.entries.filter((entry) => entry.kind !== "DIRECTORY")).toHaveLength(4);
    const files = await readArchiveForApply(result.bytes, parsed);
    expect(files.get("main.tex")?.toString("utf8")).toBe(importMainTex);
    expect(files.get("chapters/intro.tex")?.toString("utf8")).toBe(importIntroTex);
    expect(files.get("assets/fig.png")).toEqual(minimalPng());
    for (const file of result.files) {
      const exported = files.get(file.path)!;
      expect(file.sha256).toBe(createHash("sha256").update(exported).digest("hex"));
      expect(file.sizeBytes).toBe(exported.length);
    }
  });

  it("is byte-identical across repeated exports of one revision", async () => {
    const title = `S05-T04 stable ${randomUUID()}`;
    const { projectId, revisionNo } = await stageExportedProject(title);
    const first = await buildSourceZip(fixture.db, storage, { projectId, actorId, revisionNo });
    const second = await buildSourceZip(fixture.db, storage, { projectId, actorId, revisionNo });
    expect(second.bytes).toEqual(first.bytes);
    expect(second.manifestHash).toBe(first.manifestHash);
  });

  it("pins the tree to the requested revision, not the current tree", async () => {
    const title = `S05-T04 pinned ${randomUUID()}`;
    const { projectId, revisionNo } = await stageExportedProject(title);
    const nodeId = randomUUID();
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "appendix\n");
    const update = Buffer.from(Y.encodeStateAsUpdate(doc));
    doc.destroy();
    await fixture.db.query(
      `INSERT INTO project_nodes
         (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, $2, NULL, 'appendix.tex', 'FILE', 'application/x-tex', 'TEXT', 9, NULL)`,
      [nodeId, projectId],
    );
    await fixture.db.query(
      "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
      [nodeId, projectId],
    );
    await fixture.db.query(
      `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes, created_at)
       VALUES ($1, $2, 1, $3, $4, NOW())`,
      [randomUUID(), nodeId, actorId, update],
    );
    const second = await revisions.createStructuralRevision({
      projectId,
      authorId: actorId,
      source: "manual",
      label: null,
    });
    const oldExport = await buildSourceZip(fixture.db, storage, { projectId, actorId, revisionNo });
    const newExport = await buildSourceZip(fixture.db, storage, {
      projectId,
      actorId,
      revisionNo: second.revisionNo,
    });
    expect(oldExport.files.some((file) => file.path === "appendix.tex")).toBe(false);
    expect(newExport.files.some((file) => file.path === "appendix.tex")).toBe(true);
  });

  it("denies foreign actors, trashed projects and unknown revisions", async () => {
    const title = `S05-T04 denied ${randomUUID()}`;
    const { projectId, revisionNo } = await stageExportedProject(title);
    const stranger = await fixture.seed();
    await expect(
      buildSourceZip(fixture.db, storage, { projectId, actorId: stranger.id, revisionNo }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      buildSourceZip(fixture.db, storage, { projectId, actorId, revisionNo: 999999 }),
    ).rejects.toMatchObject({ status: 404 });
    await fixture.db.query("UPDATE projects SET status = 'trashed' WHERE id = $1", [projectId]);
    await expect(
      buildSourceZip(fixture.db, storage, { projectId, actorId, revisionNo }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      buildSourceZip(fixture.db, storage, {
        projectId: "00000000-0000-0000-0000-000000000000",
        actorId,
        revisionNo,
      }),
    ).rejects.toBeInstanceOf(SourceExportError);
  });
});
