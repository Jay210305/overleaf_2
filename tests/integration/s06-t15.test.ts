import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import type { CompilerExecutor, ExecuteInput, ExecuteOutput } from "@latex-collab/contracts";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyCompileMigrations } from "../helpers/compile-migrations.js";
import { CompilationWorker } from "../../apps/jobs/src/compilation/worker.js";

describe("S06-T15 Deploy trusted staging slice and smoke integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let owner: { id: string; email: string };
  let projectId: string;

  const validPdf = new TextEncoder().encode("%PDF-1.5\nStaging slice valid PDF\n%%EOF");
  const validLog = new TextEncoder().encode("Transcript: compilation successful on staging.\n");

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
        title: `Staging Smoke Project ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    expect(projRes.statusCode).toBe(201);
    projectId = projRes.json().id;

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

  it("verifies health liveness and readiness probes", async () => {
    const liveRes = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json().status).toBe("live");

    const readyRes = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
    expect(readyRes.statusCode).toBe(200);
    expect(readyRes.json()).toHaveProperty("status", "ready");
  });

  it("rejects unauthorized access when missing account credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: { origin },
      payload: { compiler: "pdflatex" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid compiler engine with 400 Bad Request", async () => {
    const ownerSession = await getSession(owner.email);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "idempotency-key": `idemp-bad-${randomUUID()}`,
      },
      payload: { compiler: "unsupported-engine" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("enqueues valid compile job, rejects concurrent duplicate with 429, and completes execution with genuine PDF download", async () => {
    await fixture.db.query("DELETE FROM compile_jobs");
    const ownerSession = await getSession(owner.email);

    // 1. Enqueue job 1
    const enqRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "idempotency-key": `idemp-job1-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const jobId = enqRes.json().id;

    // 2. Attempt concurrent enqueue for same project with different idempotency key -> 429 QUOTA_EXCEEDED
    const quotaRes = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
        "idempotency-key": `idemp-job2-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(quotaRes.statusCode).toBe(429);
    expect(quotaRes.json().code).toBe("QUOTA_EXCEEDED");

    // 3. Worker claims and compiles
    const mockExecutor: CompilerExecutor = {
      async execute(_input: ExecuteInput, _signal: AbortSignal): Promise<ExecuteOutput> {
        return {
          status: "succeeded",
          exitCode: 0,
          diagnostics: [],
          artifacts: [
            { name: "output.pdf", mime: "application/pdf", bytes: validPdf, sha256: "hash-pdf" },
            { name: "compile.log", mime: "text/plain", bytes: validLog, sha256: "hash-log" },
          ],
        };
      },
    };

    const worker = new CompilationWorker(fixture.db, mockExecutor, storage);
    const passResult = await worker.runPass({ limit: 1 });
    expect(passResult.completed).toBe(1);

    // 4. Poll job status
    const pollRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
      },
    });
    expect(pollRes.statusCode).toBe(200);
    expect(pollRes.json().status).toBe("succeeded");
    expect(pollRes.json().pdfAvailable).toBe(true);

    // 5. Download authentic PDF artifact and verify magic bytes
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
    expect(pdfRes.body.startsWith("%PDF-")).toBe(true);

    // 6. Download log artifact
    const logRes = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/compile.log`,
      headers: {
        origin,
        cookie: ownerSession.cookie,
      },
    });
    expect(logRes.statusCode).toBe(200);
    expect(logRes.body).toContain("Transcript: compilation successful");
  });
});
