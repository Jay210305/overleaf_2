import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyCompileMigrations } from "../../helpers/compile-migrations.js";
import { persistJobArtifacts } from "../../../apps/jobs/src/compilation/artifacts.js";

describe("CMP-09 Store allowed compilation artifacts privately with retention (S06-T06)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let user: { id: string; email: string };
  let projectId: string;
  let session: { cookie: string; csrf: string };

  const pdfBytes = new TextEncoder().encode("%PDF-1.4\nMinimal\n%%EOF");
  const logBytes = new TextEncoder().encode("LaTeX output log text");
  const synctexBytes = new TextEncoder().encode("SyncTeX gzip binary simulated");

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

    user = await fixture.seed();
    const loginRes = await fixture.login(user.email);
    session = {
      cookie: String(loginRes.headers["set-cookie"]).split(";")[0]!,
      csrf: String(loginRes.headers["x-csrf-token"]),
    };

    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        title: `CMP-09 Project ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    projectId = projRes.json().id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("stores PDF, log, and SyncTeX artifacts with documented retention period and expiration timestamp", async () => {
    const enqRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": `cmp09-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const jobId = enqRes.json().id;

    const before = Date.now();
    const artifactSet = await persistJobArtifacts({
      db: fixture.db,
      storage,
      projectId,
      jobId,
      sourceHash: "0".repeat(64),
      artifacts: [
        { name: "output.pdf", mime: "application/pdf", bytes: pdfBytes, sha256: "pdf" },
        { name: "compile.log", mime: "text/plain", bytes: logBytes, sha256: "log" },
        { name: "output.synctex.gz", mime: "application/gzip", bytes: synctexBytes, sha256: "synctex" },
      ],
      retentionDays: 14,
    });

    expect(artifactSet.expiresAt).toBeDefined();
    const expiresMs = artifactSet.expiresAt!.getTime();
    const expectedMinExpires = before + 13 * 24 * 60 * 60 * 1000;
    const expectedMaxExpires = before + 15 * 24 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThan(expectedMinExpires);
    expect(expiresMs).toBeLessThan(expectedMaxExpires);

    // Verify stored S3 keys and contents
    expect(await storage.get(artifactSet.pdfKey!)).toEqual(pdfBytes);
    expect(await storage.get(artifactSet.logKey!)).toEqual(logBytes);
    expect(await storage.get(artifactSet.synctexKey!)).toEqual(synctexBytes);
  });
});
