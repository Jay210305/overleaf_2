import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { importJobViewSchema } from "@latex-collab/contracts";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createServer } from "../../../apps/api/src/server.js";
import { runImportValidationPass } from "../../../apps/jobs/src/imports/worker.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyImportMigrations } from "../../helpers/import-migrations.js";
import { buildZip, minimalPng, sha256Hex } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

const putArchive = (url: string, bytes: Uint8Array) =>
  fetch(url, { method: "PUT", body: Buffer.from(bytes) });

/**
 * PRO-02 slice: a ZIP becomes exactly one durable import job through the
 * intake, retry-safe and addressable, while project creation stays S05-T10.
 */
describe("S05-T12 PRO-02 ZIP intake", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let cookie: string;
  let csrf: string;

  const headers = (extra: Record<string, string> = {}) => ({
    origin,
    cookie,
    "x-csrf-token": csrf,
    ...extra,
  });

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyImportMigrations(fixture.db, 7);
    const owner = await fixture.seed();
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

  it("creates one queued job from a ZIP and validates it without a project", async () => {
    const bytes = buildZip([
      { name: "main.tex", data: "\\documentclass{article}\n\\begin{document}P\\end{document}\n" },
      { name: "assets/logo.png", data: minimalPng() },
    ]);
    const key = randomUUID();
    const signed = await app.inject({
      method: "POST",
      url: "/api/v1/projects/imports/presign",
      headers: headers(),
      payload: { sizeBytes: bytes.length, sha256: sha256Hex(bytes) },
    });
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect(await (await putArchive(url, bytes)).status).toBe(200);
    const done = await app.inject({
      method: "POST",
      url: "/api/v1/projects/imports",
      headers: { ...headers(), "idempotency-key": key },
      payload: { uploadId, title: "PRO-02 intake" },
    });
    expect(done.statusCode).toBe(202);
    const view = importJobViewSchema.parse(done.json());
    expect(view.status).toBe("queued");
    expect(view.title).toBe("PRO-02 intake");
    for (let attempt = 0; attempt < 25; attempt++) {
      const read = await app.inject({
        method: "GET",
        url: `/api/v1/projects/imports/${view.id}`,
        headers: headers(),
      });
      if ((read.json() as { status: string }).status === "validated") break;
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    const read = await app.inject({
      method: "GET",
      url: `/api/v1/projects/imports/${view.id}`,
      headers: headers(),
    });
    expect(importJobViewSchema.parse(read.json())).toMatchObject({
      id: view.id,
      status: "validated",
      projectId: null,
    });
  });
});
