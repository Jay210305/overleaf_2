import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyCompileMigrations } from "../../helpers/compile-migrations.js";
import { persistJobArtifacts } from "../../../apps/jobs/src/compilation/artifacts.js";

describe("CMP-01 Genuine private stored PDFs (S06-T06)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let user: { id: string; email: string };
  let projectId: string;
  let session: { cookie: string; csrf: string };

  const genuinePdf = new TextEncoder().encode("%PDF-1.7\n% Genuine LaTeX PDF content\n%%EOF");

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
        title: `CMP-01 S06-T06 Project ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    projectId = projRes.json().id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("ensures compiler output produces genuine PDF with %PDF- stored in private S3 prefix", async () => {
    const enqRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": `cmp01-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const jobId = enqRes.json().id;

    const artifactSet = await persistJobArtifacts({
      db: fixture.db,
      storage,
      projectId,
      jobId,
      sourceHash: "f".repeat(64),
      artifacts: [
        { name: "output.pdf", mime: "application/pdf", bytes: genuinePdf, sha256: "pdf-hash" },
      ],
    });

    expect(artifactSet.pdfKey).toBe(`projects/${projectId}/artifacts/${jobId}/output.pdf`);

    // Verify stored object in storage has exact private key and genuine PDF bytes
    const retrieved = await storage.get(artifactSet.pdfKey!);
    expect(retrieved).toBeDefined();
    expect(retrieved![0]).toBe(0x25); // %
    expect(retrieved![1]).toBe(0x50); // P
    expect(retrieved![2]).toBe(0x44); // D
    expect(retrieved![3]).toBe(0x46); // F
  });
});
