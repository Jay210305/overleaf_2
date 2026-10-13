import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { ImportJobRepository } from "../../packages/db/src/repositories/import-jobs.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";
import { runStorageGc } from "../../apps/jobs/src/maintenance/storage-gc.js";
import { runImportValidationPass } from "../../apps/jobs/src/imports/worker.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { buildZip } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const putArchive = (url: string, bytes: Uint8Array) =>
  fetch(url, { method: "PUT", body: Buffer.from(bytes) });

describe("S05-T12 authenticated ZIP import intake", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let ownerId: string;
  let cookie: string;
  let csrf: string;

  const authHeaders = (overrides: Record<string, string> = {}) => ({
    origin,
    cookie,
    "x-csrf-token": csrf,
    ...overrides,
  });
  const presign = (payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
    app.inject({
      method: "POST",
      url: "/api/v1/projects/imports/presign",
      headers: authHeaders(headers),
      payload,
    });
  const complete = (
    payload: Record<string, unknown>,
    key = randomUUID(),
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: "POST",
      url: "/api/v1/projects/imports",
      headers: { ...authHeaders(headers), "idempotency-key": key },
      payload,
    });
  const status = (jobId: string, headers: Record<string, string> = {}) =>
    app.inject({
      method: "GET",
      url: `/api/v1/projects/imports/${jobId}`,
      headers: authHeaders(headers),
    });

  const validZip = () =>
    buildZip([
      { name: "main.tex", data: "\\documentclass{article}\n\\begin{document}Hi\\end{document}\n" },
      { name: "refs.bib", data: "@book{k, title={T}}\n" },
    ]);

  async function intake(title = "Intake project", bytes = validZip(), key = randomUUID()) {
    const signed = await presign({ sizeBytes: bytes.length, sha256: digest(bytes) });
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    const put = await putArchive(url, bytes);
    expect(put.status).toBe(200);
    const done = await complete({ uploadId, title }, key);
    expect(done.statusCode).toBe(202);
    return { uploadId, job: done.json() as { id: string; status: string }, key, bytes };
  }

  beforeAll(async () => {
    fixture = await createSessionFixture();
    for (const migration of ["0006-import-jobs.sql", "0007-import-upload-intents.sql"]) {
      await fixture.db.query(
        readFileSync(
          resolve(import.meta.dirname, `../../packages/db/migrations/${migration}`),
          "utf8",
        ),
      );
    }
    const owner = await fixture.seed();
    ownerId = owner.id;
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    csrf = String(login.headers["x-csrf-token"]);
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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  it("presigns an actor-scoped ZIP upload for the current session", async () => {
    const bytes = validZip();
    const response = await presign({ sizeBytes: bytes.length, sha256: digest(bytes) });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { uploadId: string; url: string; expiresAt: string };
    expect(body.uploadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.url).toContain(`/imports/${ownerId}/uploads/${body.uploadId}`);
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("denies presign for bad sessions, origins, CSRF and oversize input", async () => {
    const bytes = validZip();
    const payload = { sizeBytes: bytes.length, sha256: digest(bytes) };
    expect((await presign({})).statusCode).toBe(400);
    expect((await presign({ sizeBytes: 26 * 1024 * 1024, sha256: digest(bytes) })).statusCode).toBe(
      413,
    );
    expect((await presign(payload, { cookie: "session=invalid" })).statusCode).toBe(401);
    expect((await presign(payload, { origin: "https://evil.test" })).statusCode).toBe(403);
    expect((await presign(payload, { "x-csrf-token": "wrong" })).statusCode).toBe(403);
  });

  it("denies presign for a disabled account", async () => {
    await fixture.db.query("UPDATE users SET disabled_at = NOW() WHERE id = $1", [ownerId]);
    const bytes = validZip();
    const denied = await presign({ sizeBytes: bytes.length, sha256: digest(bytes) });
    expect(denied.statusCode).toBe(403);
    await fixture.db.query("UPDATE users SET disabled_at = NULL WHERE id = $1", [ownerId]);
  });

  it("verifies bytes and enqueues exactly one job per actor, key and input", async () => {
    const key = randomUUID();
    const first = await intake("Same key project", validZip(), key);
    expect(first.job.status).toBe("queued");
    expect(first.job).not.toHaveProperty("archiveKey");
    expect(first.job).toMatchObject({ title: "Same key project", projectId: null });
    const retry = await complete({ uploadId: first.uploadId, title: "Same key project" }, key);
    expect(retry.statusCode).toBe(202);
    expect(retry.json()).toMatchObject({ id: first.job.id });
    const read = await status(first.job.id);
    expect(read.statusCode).toBe(200);
    const readBody = read.json() as { id: string; status: string };
    expect(readBody.id).toBe(first.job.id);
    // A sibling validation worker may advance the job concurrently.
    expect(["queued", "validating", "validated"]).toContain(readBody.status);
  });

  it("recovers staging when the first completion crashes before the copy", async () => {
    const bytes = validZip();
    const key = randomUUID();
    const signed = await presign({ sizeBytes: bytes.length, sha256: digest(bytes) });
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect(await (await putArchive(url, bytes)).status).toBe(200);
    const jobs = new ImportJobRepository(fixture.db);
    const staged = await jobs.reserve({
      actorId: ownerId,
      idempotencyKey: key,
      archiveSha256: digest(bytes),
      archiveSize: bytes.length,
      title: "Crash recovery",
    });
    expect(staged.created).toBe(true);
    expect(staged.job.status).toBe("staging");
    const done = await complete({ uploadId, title: "Crash recovery" }, key);
    expect(done.statusCode).toBe(202);
    expect(done.json()).toMatchObject({ id: staged.job.id, status: "queued" });
    const again = await complete({ uploadId, title: "Crash recovery" }, key);
    expect(again.statusCode).toBe(202);
    expect(again.json()).toMatchObject({ id: staged.job.id });
  });

  it("denies foreign uploads, mismatched bytes, changed-key reuse and expired intents", async () => {
    const bytes = validZip();
    expect((await complete({ uploadId: randomUUID(), title: "Foreign" })).statusCode).toBe(404);
    const signed = await presign({ sizeBytes: bytes.length, sha256: digest(bytes) });
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    const tampered = buildZip([{ name: "main.tex", data: "tampered\n" }]);
    expect(await (await putArchive(url, tampered)).status).toBe(200);
    expect((await complete({ uploadId, title: "Tampered" })).statusCode).toBe(422);
    const key = randomUUID();
    const other = await intake("Changed input", validZip(), key);
    void other;
    const clash = await complete({ uploadId: other.uploadId, title: "Different title" }, key);
    expect(clash.statusCode).toBe(409);
    const stale = validZip();
    const staleSigned = await presign({ sizeBytes: stale.length, sha256: digest(stale) });
    const staleBody = staleSigned.json() as { uploadId: string; url: string };
    expect(await (await putArchive(staleBody.url, stale)).status).toBe(200);
    await fixture.db.query(
      "UPDATE import_upload_intents SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [staleBody.uploadId],
    );
    expect((await complete({ uploadId: staleBody.uploadId, title: "Stale" })).statusCode).toBe(422);
  });

  it("rejects oversized staged objects beyond the ZIP budget", async () => {
    const declared = 25 * 1024 * 1024;
    const real = Buffer.alloc(26 * 1024 * 1024, 0);
    const signed = await presign({
      sizeBytes: declared,
      sha256: digest(real.subarray(0, declared)),
    });
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect(await (await putArchive(url, real)).status).toBe(200);
    const done = await complete({ uploadId, title: "Oversize" });
    expect(done.statusCode).toBe(413);
  });

  it("keeps foreign jobs invisible on status reads", async () => {
    const { job } = await intake();
    const stranger = await fixture.seed();
    const strangerLogin = await fixture.login(stranger.email);
    const strangerCookie = String(strangerLogin.headers["set-cookie"]).split(";")[0]!;
    const strangerCsrf = String(strangerLogin.headers["x-csrf-token"]);
    const foreign = await app.inject({
      method: "GET",
      url: `/api/v1/projects/imports/${job.id}`,
      headers: { origin, cookie: strangerCookie, "x-csrf-token": strangerCsrf },
    });
    expect(foreign.statusCode).toBe(404);
    const malformed = await app.inject({
      method: "GET",
      url: "/api/v1/projects/imports/not-a-uuid",
      headers: authHeaders(),
    });
    expect(malformed.statusCode).toBe(400);
  });

  it("hands queued jobs to validation without creating a project", async () => {
    const { job, bytes } = await intake("Handoff project");
    void bytes;
    for (let attempt = 0; attempt < 25; attempt++) {
      const current = await status(job.id);
      if ((current.json() as { status: string }).status === "validated") break;
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    const read = await status(job.id);
    expect(read.json()).toMatchObject({ id: job.id, status: "validated", projectId: null });
    const projects = await fixture.db.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM projects WHERE title = 'Handoff project'",
    );
    expect(projects.rows[0]?.total).toBe("0");
  });

  it("cleans expired import staging after URL expiry", async () => {
    const bytes = validZip();
    const signed = await presign({ sizeBytes: bytes.length, sha256: digest(bytes) });
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect(await (await putArchive(url, bytes)).status).toBe(200);
    const stagingKey = `imports/${ownerId}/uploads/${uploadId}`;
    expect(await storage.head(stagingKey)).not.toBeNull();
    await fixture.db.query(
      "UPDATE import_upload_intents SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [uploadId],
    );
    // Actor-scoped with a forged clock so only this actor's aged staging is
    // eligible; sibling tests' active intents and fresh objects are untouched.
    const future = new Date(Date.now() + 11 * 60_000);
    for (let attempt = 0; attempt < 5; attempt++) {
      await runStorageGc(fixture.db, storage, { actorId: ownerId, now: future });
      if ((await storage.head(stagingKey)) === null) break;
    }
    expect(await storage.head(stagingKey)).toBeNull();
  });

  it("reports safe import status without object keys", async () => {
    const { job } = await intake("Status shape");
    const read = await status(job.id);
    expect(read.statusCode).toBe(200);
    const body = read.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "createdAt",
      "errorCode",
      "id",
      "projectId",
      "status",
      "title",
      "updatedAt",
    ]);
  });
});
