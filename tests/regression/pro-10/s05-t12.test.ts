import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createServer } from "../../../apps/api/src/server.js";
import { runImportValidationPass } from "../../../apps/jobs/src/imports/worker.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { buildZip, sha256Hex } from "../../helpers/zip-fixtures.js";

loadEnvFile(".env");

const putArchive = (url: string, bytes: Uint8Array) =>
  fetch(url, { method: "PUT", body: Buffer.from(bytes) });

/**
 * PRO-10 slice: a hostile ZIP admitted through the authenticated intake is
 * quarantined as a failed job. No project ever appears for it.
 */
describe("S05-T12 PRO-10 hostile ZIP intake", () => {
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
    for (const migration of ["0006-import-jobs.sql", "0007-import-upload-intents.sql"]) {
      await fixture.db.query(
        readFileSync(
          resolve(import.meta.dirname, `../../../packages/db/migrations/${migration}`),
          "utf8",
        ),
      );
    }
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

  it("quarantines a traversal ZIP admitted through the intake", async () => {
    const bytes = buildZip([{ name: "../../evil.tex", data: "x\n" }]);
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
      headers: { ...headers(), "idempotency-key": randomUUID() },
      payload: { uploadId, title: "Hostile intake" },
    });
    expect(done.statusCode).toBe(202);
    const { id } = done.json() as { id: string };
    let errorCode: string | null = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      const read = await app.inject({
        method: "GET",
        url: `/api/v1/projects/imports/${id}`,
        headers: headers(),
      });
      const body = read.json() as {
        status: string;
        errorCode: string | null;
        projectId: string | null;
      };
      if (body.status === "failed") {
        errorCode = body.errorCode;
        expect(body.projectId).toBeNull();
        break;
      }
      await runImportValidationPass(fixture.db, storage, { limit: 5 });
    }
    expect(errorCode).toBe("UNSAFE_PATH");
    const projects = await fixture.db.query<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM projects WHERE title = 'Hostile intake'",
    );
    expect(projects.rows[0]?.total).toBe("0");
  });
});
