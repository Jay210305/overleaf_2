import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { runStorageGc } from "../../apps/jobs/src/maintenance/storage-gc.js";
import { createSessionFixture } from "../helpers/s02-session.js";

loadEnvFile(".env");

describe("S05-T09 upload storage cleanup", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let projectId: string;
  let ownerId: string;
  const createdKeys: string[] = [];
  const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const future = () => new Date(Date.now() + 11 * 60_000);

  async function put(key: string, bytes: Buffer): Promise<void> {
    createdKeys.push(key);
    await storage.put(key, bytes, "application/octet-stream");
  }

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../packages/db/migrations/0005-upload-intents.sql"),
        "utf8",
      ),
    );
    const owner = await fixture.seed();
    ownerId = owner.id;
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  });

  beforeEach(async () => {
    projectId = (
      await createProject(fixture.db, ownerId, {
        title: "Storage GC project",
        compiler: "pdflatex",
      })
    ).id;
  });

  afterAll(async () => {
    if (storage) {
      for (const key of createdKeys) await storage.delete(key);
    }
    if (fixture) await fixture.close();
  });

  it("lists project objects in bounded pages with modification time", async () => {
    const prefix = `projects/${projectId}/uploads/list-${randomUUID()}/`;
    const firstKey = `${prefix}first`;
    const secondKey = `${prefix}second`;
    createdKeys.push(firstKey, secondKey);
    await storage.put(firstKey, Buffer.from("a"), "text/plain");
    await storage.put(secondKey, Buffer.from("b"), "text/plain");

    const first = await storage.list(prefix, undefined, 1);
    expect(first.objects).toHaveLength(1);
    expect(first.objects[0]?.key.startsWith(prefix)).toBe(true);
    expect(first.objects[0]?.lastModified).toBeInstanceOf(Date);
    expect(first.cursor).toBeTruthy();
    const second = await storage.list(prefix, first.cursor ?? undefined, 1);
    expect(second.objects).toHaveLength(1);
    expect(new Set([...first.objects, ...second.objects].map((item) => item.key))).toEqual(
      new Set([firstKey, secondKey]),
    );
    expect(second.cursor).toBeNull();
    expect((await storage.head(firstKey))?.lastModified).toBeInstanceOf(Date);
  });

  it("removes expired staging but preserves an unexpired upload intent", async () => {
    const expiredId = randomUUID();
    const activeId = randomUUID();
    const expiredKey = `projects/${projectId}/uploads/${expiredId}`;
    const activeKey = `projects/${projectId}/uploads/${activeId}`;
    const bytes = Buffer.from("pending upload");
    await put(expiredKey, bytes);
    await put(activeKey, bytes);
    for (const [id, key, expiry] of [
      [expiredId, expiredKey, new Date(Date.now() - 60_000)],
      [activeId, activeKey, new Date(Date.now() + 30 * 60_000)],
    ] as const) {
      await fixture.db.query(
        `INSERT INTO pending_uploads
         (id, project_id, actor_id, file_name, mime, content_kind, expected_size,
          expected_sha256, staging_key, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'TEXT', $6, $7, $8, $9)`,
        [
          id,
          projectId,
          ownerId,
          `${id}.bib`,
          "text/plain",
          bytes.length,
          sha256(bytes),
          key,
          expiry,
        ],
      );
    }

    const result = await runStorageGc(fixture.db, storage, {
      projectId,
      now: future(),
      maxDeletes: 10,
    });
    expect(result.deleted).toBe(1);
    expect(await storage.head(expiredKey)).toBeNull();
    expect(await storage.head(activeKey)).not.toBeNull();
  });

  it("deletes an unreferenced blob when the project has no revisions", async () => {
    const key = `projects/${projectId}/blobs/${sha256(Buffer.from("orphan"))}`;
    await put(key, Buffer.from("orphan"));
    const result = await runStorageGc(fixture.db, storage, {
      projectId,
      now: future(),
      maxDeletes: 10,
    });
    expect(result.deleted).toBe(1);
    expect(await storage.head(key)).toBeNull();
  });

  it("retains project blobs while any revision may have historical references", async () => {
    const keys = ["orphan", "current", "revision", "artifact"].map(
      (name) => `projects/${projectId}/blobs/${sha256(Buffer.from(name))}`,
    );
    for (const [index, key] of keys.entries()) await put(key!, Buffer.from(`blob-${index}`));
    await fixture.db.query(
      `INSERT INTO project_nodes
       (project_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, 'current.png', 'FILE', 'image/png', 'BINARY', 1, $2)`,
      [projectId, keys[1]],
    );
    const revision = await fixture.db.query<{ id: string; main_file_id: string }>(
      `INSERT INTO project_revisions
       (project_id, revision_no, manifest_key, manifest_hash, source)
       VALUES ($1, 9001, $2, $3, 'manual') RETURNING id`,
      [projectId, `projects/${projectId}/revisions/9001.json`, "a".repeat(64)],
    );
    const project = await fixture.db.query<{ main_file_id: string }>(
      "SELECT main_file_id FROM projects WHERE id = $1",
      [projectId],
    );
    await fixture.db.query(
      `INSERT INTO revision_items (revision_id, node_id, path, blob_key, sha256)
       VALUES ($1, $2, 'historical.bib', $3, $4)`,
      [revision.rows[0]!.id, project.rows[0]!.main_file_id, keys[2], "b".repeat(64)],
    );
    const job = await fixture.db.query<{ id: string }>(
      `INSERT INTO compile_jobs
       (project_id, requested_by, source_revision_id, engine, options_hash, status)
       VALUES ($1, $2, $3, 'pdflatex', 'test', 'queued') RETURNING id`,
      [projectId, ownerId, revision.rows[0]!.id],
    );
    await fixture.db.query(
      `INSERT INTO artifact_sets (compile_job_id, pdf_key, source_hash)
       VALUES ($1, $2, $3)`,
      [job.rows[0]!.id, keys[3], "c".repeat(64)],
    );

    const result = await runStorageGc(fixture.db, storage, {
      projectId,
      now: future(),
      maxDeletes: 10,
    });
    expect(result.deleted).toBe(0);
    for (const key of keys) expect(await storage.head(key!)).not.toBeNull();
  });

  it("does not scan object keys for a project absent from PostgreSQL", async () => {
    const unknownProjectId = randomUUID();
    const key = `projects/${unknownProjectId}/blobs/${sha256(Buffer.from("unknown"))}`;
    await put(key, Buffer.from("unknown"));
    const result = await runStorageGc(fixture.db, storage, {
      projectId: unknownProjectId,
      now: future(),
    });
    expect(result.deleted).toBe(0);
    expect(await storage.head(key)).not.toBeNull();
  });

  it("retries a failed object deletion on the next pass", async () => {
    const key = `projects/${projectId}/blobs/${sha256(Buffer.from("retry"))}`;
    await put(key, Buffer.from("retry"));
    let failOnce = true;
    const flaky = new Proxy(storage, {
      get(target, property) {
        if (property === "delete")
          return async (candidate: string) => {
            if (failOnce) {
              failOnce = false;
              throw new Error("transient storage failure");
            }
            await target.delete(candidate);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const first = await runStorageGc(fixture.db, flaky, { projectId, now: future() });
    expect(first.failed).toBe(1);
    expect(await storage.head(key)).not.toBeNull();
    const second = await runStorageGc(fixture.db, flaky, { projectId, now: future() });
    expect(second.deleted).toBe(1);
    expect(await storage.head(key)).toBeNull();
  });
});
