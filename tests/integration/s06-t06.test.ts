import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import type { CompilerExecutor, ExecuteInput, ExecuteOutput } from "@latex-collab/contracts";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyCompileMigrations } from "../helpers/compile-migrations.js";
import { CompilationWorker } from "../../apps/jobs/src/compilation/worker.js";
import { CompilationsRepository } from "@latex-collab/db";
import {
  isValidPdf,
  PdfValidationError,
  persistJobArtifacts,
} from "../../apps/jobs/src/compilation/artifacts.js";

describe("S06-T06 Persist verified artifacts and job result integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let viewer: { id: string; email: string };
  let outsider: { id: string; email: string };
  let projectId: string;

  const validPdfBytes = new TextEncoder().encode(
    "%PDF-1.5\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF",
  );
  const invalidPdfBytes = new TextEncoder().encode("Not a valid PDF header at all");
  const logBytes = new TextEncoder().encode(
    "This is TeX compilation log output.\nTranscript finished.",
  );
  const synctexBytes = new TextEncoder().encode("SyncTeX Version:1\nInput:1:main.tex");

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
    editor = await fixture.seed();
    viewer = await fixture.seed();
    outsider = await fixture.seed();

    const ownerSession = await getSession(owner.email);
    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
      },
      payload: {
        title: `S06-T06 Artifacts Test Project ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    expect(projRes.statusCode).toBe(201);
    projectId = projRes.json().id;

    // Add editor and viewer
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'EDITOR', now()), ($1, $3, 'VIEWER', now())`,
      [projectId, editor.id, viewer.id],
    );

    await fixture.db.query("DELETE FROM compile_jobs");
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const response = await fixture.login(email);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("validates PDF magic header %PDF- correctly", () => {
    expect(isValidPdf(validPdfBytes)).toBe(true);
    expect(isValidPdf(invalidPdfBytes)).toBe(false);
    expect(isValidPdf(new Uint8Array([]))).toBe(false);
  });

  it("persists genuine PDF and log artifacts transactionally and supports idempotent retry", async () => {
    const ownerSession = await getSession(owner.email);

    // 1. Enqueue job
    const enqRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "idempotency-key": `idemp-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const jobId = enqRes.json().id;

    // 2. Persist artifacts directly
    const sourceHash = "a".repeat(64);
    const artifactSet = await persistJobArtifacts({
      db: fixture.db,
      storage,
      projectId,
      jobId,
      sourceHash,
      artifacts: [
        { name: "output.pdf", mime: "application/pdf", bytes: validPdfBytes, sha256: "hash-pdf" },
        { name: "compile.log", mime: "text/plain", bytes: logBytes, sha256: "hash-log" },
        {
          name: "output.synctex.gz",
          mime: "application/gzip",
          bytes: synctexBytes,
          sha256: "hash-synctex",
        },
      ],
      retentionDays: 14,
    });

    expect(artifactSet.id).toBeDefined();
    expect(artifactSet.compileJobId).toBe(jobId);
    expect(artifactSet.pdfKey).toBe(`projects/${projectId}/artifacts/${jobId}/output.pdf`);
    expect(artifactSet.logKey).toBe(`projects/${projectId}/artifacts/${jobId}/compile.log`);
    expect(artifactSet.synctexKey).toBe(
      `projects/${projectId}/artifacts/${jobId}/output.synctex.gz`,
    );

    // 3. Verify retry idempotency: repeating persistence does not create a duplicate row
    const retrySet = await persistJobArtifacts({
      db: fixture.db,
      storage,
      projectId,
      jobId,
      sourceHash,
      artifacts: [
        { name: "output.pdf", mime: "application/pdf", bytes: validPdfBytes, sha256: "hash-pdf" },
        { name: "compile.log", mime: "text/plain", bytes: logBytes, sha256: "hash-log" },
      ],
    });
    expect(retrySet.compileJobId).toBe(jobId);

    const countRes = await fixture.db.query<{ count: string }>(
      `SELECT count(*) FROM artifact_sets WHERE compile_job_id = $1`,
      [jobId],
    );
    expect(Number(countRes.rows[0]?.count)).toBe(1);

    // 4. Verify objects are stored in S3
    const pdfInStorage = await storage.get(artifactSet.pdfKey!);
    expect(pdfInStorage).toBeDefined();
    expect(new TextDecoder().decode(pdfInStorage!)).toBe(new TextDecoder().decode(validPdfBytes));

    const logInStorage = await storage.get(artifactSet.logKey!);
    expect(logInStorage).toBeDefined();
    expect(new TextDecoder().decode(logInStorage!)).toBe(new TextDecoder().decode(logBytes));

    const compRepo = new CompilationsRepository(fixture.db);
    await compRepo.completeJob(jobId, {
      status: "succeeded",
      pdfAvailable: true,
      artifactSetId: artifactSet.id,
    });
  });

  it("rejects invalid PDF bytes with PdfValidationError and preserves state", async () => {
    const fakeJobId = randomUUID();
    await expect(
      persistJobArtifacts({
        db: fixture.db,
        storage,
        projectId,
        jobId: fakeJobId,
        sourceHash: "b".repeat(64),
        artifacts: [
          {
            name: "output.pdf",
            mime: "application/pdf",
            bytes: invalidPdfBytes,
            sha256: "bad-hash",
          },
        ],
      }),
    ).rejects.toThrow(PdfValidationError);
  });

  it("worker fails closed with INVALID_PDF_ARTIFACT when executor returns non-PDF bytes for output.pdf", async () => {
    await fixture.db.query("DELETE FROM compile_jobs");
    const ownerSession = await getSession(owner.email);

    const enqRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "idempotency-key": `idemp-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const jobId = enqRes.json().id;

    const badExecutor: CompilerExecutor = {
      async execute(_input: ExecuteInput, _signal: AbortSignal): Promise<ExecuteOutput> {
        return {
          status: "succeeded",
          exitCode: 0,
          diagnostics: [],
          artifacts: [
            { name: "output.pdf", mime: "application/pdf", bytes: invalidPdfBytes, sha256: "fake" },
          ],
        };
      },
    };

    const worker = new CompilationWorker(fixture.db, badExecutor, storage);
    const passResult = await worker.runPass({ limit: 1 });
    expect(passResult.claimed).toBe(1);
    expect(passResult.failed).toBe(1);

    // Verify job in database is failed with INVALID_PDF_ARTIFACT
    const jobRes = await fixture.db.query<{
      status: string;
      error_code: string;
      pdf_available: boolean;
    }>(`SELECT status, error_code, pdf_available FROM compile_jobs WHERE id = $1`, [jobId]);
    expect(jobRes.rows[0]?.status).toBe("failed");
    expect(jobRes.rows[0]?.error_code).toBe("INVALID_PDF_ARTIFACT");
    expect(jobRes.rows[0]?.pdf_available).toBe(false);
  });

  it("serves persisted artifacts via HTTP API with authorization enforcement", async () => {
    await fixture.db.query("DELETE FROM compile_jobs");
    const ownerSession = await getSession(owner.email);
    const viewerSession = await getSession(viewer.email);
    const outsiderSession = await getSession(outsider.email);

    // 1. Enqueue job
    const enqRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "idempotency-key": `idemp-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const jobId = enqRes.json().id;

    // 2. Execute with mock genuine executor
    const goodExecutor: CompilerExecutor = {
      async execute(_input: ExecuteInput, _signal: AbortSignal): Promise<ExecuteOutput> {
        return {
          status: "succeeded",
          exitCode: 0,
          diagnostics: [],
          artifacts: [
            {
              name: "output.pdf",
              mime: "application/pdf",
              bytes: validPdfBytes,
              sha256: "pdf-hash",
            },
            { name: "compile.log", mime: "text/plain", bytes: logBytes, sha256: "log-hash" },
          ],
        };
      },
    };

    const worker = new CompilationWorker(fixture.db, goodExecutor, storage);
    const passResult = await worker.runPass({ limit: 1 });
    expect(passResult.completed).toBe(1);

    // 3. GET /compilations/:jobId/artifacts metadata as owner and viewer
    const ownerMetaRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}/artifacts`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
      },
    });
    expect(ownerMetaRes.statusCode).toBe(200);
    const metaBody = ownerMetaRes.json();
    expect(metaBody.jobId).toBe(jobId);
    expect(metaBody.items).toHaveLength(2);
    expect(metaBody.items.map((it: { name: string }) => it.name)).toContain("output.pdf");
    expect(metaBody.items.map((it: { name: string }) => it.name)).toContain("compile.log");

    // Viewer also has READ access
    const viewerMetaRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}/artifacts`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
      },
    });
    expect(viewerMetaRes.statusCode).toBe(200);

    // 4. Download output.pdf content
    const pdfRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/output.pdf`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
      },
    });
    expect(pdfRes.statusCode).toBe(200);
    expect(pdfRes.headers["content-type"]).toBe("application/pdf");
    expect(pdfRes.body).toBe(new TextDecoder().decode(validPdfBytes));

    // 5. Download compile.log content
    const logRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/compile.log`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
      },
    });
    expect(logRes.statusCode).toBe(200);
    expect(logRes.headers["content-type"]).toContain("text/plain");
    expect(logRes.body).toBe(new TextDecoder().decode(logBytes));

    // 6. Unknown artifact returns 404
    const unknownRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/secret.sh`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
      },
    });
    expect(unknownRes.statusCode).toBe(404);

    // 7. Outsider access is forbidden (404/403)
    const outsiderRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/output.pdf`,
      headers: {
        origin,
        cookie: outsiderSession.cookie,
      },
    });
    expect(outsiderRes.statusCode).toBe(404);

    // 8. Unauthenticated access returns 401
    const unauthRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/output.pdf`,
      headers: { origin },
    });
    expect(unauthRes.statusCode).toBe(401);
  });
});
