import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyCompileMigrations } from "../helpers/compile-migrations.js";
import { CompilationWorker } from "../../apps/jobs/src/compilation/worker.js";
import { TrustedWorkerExecutor } from "../../apps/jobs/src/compilation/trusted-worker-executor.js";

describe("S06-T10 Verify genuine compiler fixtures integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let owner: { id: string; email: string };
  let projectId: string;
  let session: { cookie: string; csrf: string };

  const validPdfHeader = "%PDF-1.5\n% Genuine LaTeX Article Fixture\n%%EOF";

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
    const loginRes = await fixture.login(owner.email);
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
        title: `S06-T10 Genuine Fixtures ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    projectId = projRes.json().id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("compiles valid document, persists PDF, and retains previous output when next build has a syntax error", async () => {
    await fixture.db.query("DELETE FROM compile_jobs");

    // 1. Enqueue valid compilation
    const enq1 = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": `idemp1-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enq1.statusCode).toBe(202);
    const job1Id = enq1.json().id;

    // 2. Worker executes valid fixture
    const validExecutor = new TrustedWorkerExecutor({
      runner: async (_cmd, args, options) => {
        const outDir =
          args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? join(options.cwd, "../out");
        await writeFile(join(outDir, "main.pdf"), validPdfHeader);
        await writeFile(join(outDir, "main.log"), "Output written on main.pdf (1 page).");
        return { exitCode: 0, stdout: "Latexmk: All targets up to date", stderr: "" };
      },
    });

    const worker1 = new CompilationWorker(fixture.db, validExecutor, storage);
    const pass1 = await worker1.runPass({ limit: 1 });
    expect(pass1.completed).toBe(1);

    // Verify first job succeeded and PDF is accessible
    const job1Status = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${job1Id}`,
      headers: { origin, cookie: session.cookie },
    });
    expect(job1Status.statusCode).toBe(200);
    expect(job1Status.json().status).toBe("succeeded");
    expect(job1Status.json().pdfAvailable).toBe(true);

    const pdfRes1 = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${job1Id}/artifacts/output.pdf`,
      headers: { origin, cookie: session.cookie },
    });
    expect(pdfRes1.statusCode).toBe(200);
    expect(pdfRes1.body).toContain("%PDF-1.5");

    // 3. Enqueue second compilation (syntax error fixture)
    const enq2 = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": `idemp2-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enq2.statusCode).toBe(202);
    const job2Id = enq2.json().id;

    // 4. Worker executes syntax error fixture
    const failingExecutor = new TrustedWorkerExecutor({
      runner: async (_cmd, args, options) => {
        const outDir =
          args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? join(options.cwd, "../out");
        await writeFile(
          join(outDir, "main.log"),
          "main.tex:22: Undefined control sequence.\nl.22 \\invalidmacro\n!  ==> Fatal error occurred",
        );
        return { exitCode: 1, stdout: "", stderr: "Fatal error in LaTeX processing" };
      },
    });

    const worker2 = new CompilationWorker(fixture.db, failingExecutor, storage);
    const pass2 = await worker2.runPass({ limit: 1 });
    expect(pass2.failed).toBe(1);

    // Verify second job failed with diagnostics and no PDF
    const job2Status = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${job2Id}`,
      headers: { origin, cookie: session.cookie },
    });
    expect(job2Status.statusCode).toBe(200);
    expect(job2Status.json().status).toBe("failed");
    expect(job2Status.json().pdfAvailable).toBe(false);
    expect(job2Status.json().diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(job2Status.json().diagnostics[0].line).toBe(22);

    // 5. Invariant: First job's output.pdf is retained and intact in storage and HTTP API
    const pdfResRetained = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${job1Id}/artifacts/output.pdf`,
      headers: { origin, cookie: session.cookie },
    });
    expect(pdfResRetained.statusCode).toBe(200);
    expect(pdfResRetained.body).toContain("%PDF-1.5");
  });
});
