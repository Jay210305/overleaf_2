import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { applyCompileMigrations } from "../helpers/compile-migrations.js";
import { CompilationWorker } from "../../apps/jobs/src/compilation/worker.js";
import type { CompilerExecutor } from "@latex-collab/contracts";

describe("S06-T01 Durable compile queue jobs and idempotency integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let viewer: { id: string; email: string };
  let outsider: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);

    owner = await fixture.seed();
    editor = await fixture.seed();
    viewer = await fixture.seed();
    outsider = await fixture.seed();

    const ownerSession = await getSession(owner.email);

    // Create project
    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: ownerSession.cookie,
        "x-csrf-token": ownerSession.csrf,
      },
      payload: {
        title: `S06-T01 Project ${randomUUID()}`,
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

    // Clean any prior compile jobs
    await fixture.db.query("DELETE FROM compile_jobs");
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("enqueues a compilation job and replaying the same Idempotency-Key returns the existing job", async () => {
    const session = await getSession(owner.email);
    const key = `idemp-key-s06-t01-${randomUUID()}`;

    // 1. Initial request
    const res1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: {
        compiler: "pdflatex",
        forceClean: false,
      },
    });

    expect(res1.statusCode).toBe(202);
    const job1 = res1.json();
    expect(job1.id).toBeDefined();
    expect(job1.projectId).toBe(projectId);
    expect(job1.status).toBe("queued");
    expect(job1.sourceRevisionId).toBeDefined();

    // 2. Replay with identical key & payload
    const res2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: {
        compiler: "pdflatex",
        forceClean: false,
      },
    });

    expect(res2.statusCode).toBe(202);
    const job2 = res2.json();
    expect(job2.id).toBe(job1.id);
    expect(job2.status).toBe(job1.status);

    // Clean up active job for next tests
    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job1.id],
    );
  });

  it("rejects duplicate Idempotency-Key when payload is modified (conflict)", async () => {
    const session = await getSession(owner.email);
    const key = `idemp-key-s06-t01-${randomUUID()}`;

    const res1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: {
        compiler: "pdflatex",
        forceClean: false,
      },
    });
    expect(res1.statusCode).toBe(202);
    const job1 = res1.json();

    // Replay with different compiler -> conflict
    const res2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: {
        compiler: "xelatex",
        forceClean: false,
      },
    });

    expect(res2.statusCode).toBe(400);
    expect(res2.json().code).toBe("CONSTRAINT_VIOLATION");

    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job1.id],
    );
  });

  it("rejects request when Idempotency-Key is missing or too short", async () => {
    const session = await getSession(owner.email);

    // Missing header
    const resMissing = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(resMissing.statusCode).toBe(400);

    // Too short header (< 16 chars)
    const resShort = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": "short-key",
      },
      payload: { compiler: "pdflatex" },
    });
    expect(resShort.statusCode).toBe(400);
  });

  it("enforces concurrent quota: rejects second active job with 429 QUOTA_EXCEEDED", async () => {
    const session = await getSession(owner.email);
    const key1 = `idemp-key-s06-t01-${randomUUID()}`;
    const key2 = `idemp-key-s06-t01-${randomUUID()}`;

    // Job 1 -> queued
    const res1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key1,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(res1.statusCode).toBe(202);
    const job1 = res1.json();

    // Job 2 -> rejected because Job 1 is still active
    const res2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key2,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(res2.statusCode).toBe(429);
    expect(res2.json().code).toBe("QUOTA_EXCEEDED");
    expect(res2.headers["retry-after"]).toBe("5");

    // Complete Job 1 -> now Job 2 can be enqueued
    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job1.id],
    );

    const res3 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key2,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(res3.statusCode).toBe(202);
    const job3 = res3.json();

    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'cancelled', finished_at = now() WHERE id = $1",
      [job3.id],
    );
  });

  it("supports role-based compile authorization: OWNER and EDITOR can compile, VIEWER cannot", async () => {
    const editorSession = await getSession(editor.email);
    const viewerSession = await getSession(viewer.email);
    const outsiderSession = await getSession(outsider.email);

    // Editor compiles -> allowed
    const editorKey = `idemp-key-s06-t01-${randomUUID()}`;
    const resEditor = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: editorSession.cookie,
        "x-csrf-token": editorSession.csrf,
        "idempotency-key": editorKey,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(resEditor.statusCode).toBe(202);
    const editorJob = resEditor.json();

    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [editorJob.id],
    );

    // Viewer compiles -> denied 403
    const viewerKey = `idemp-key-s06-t01-${randomUUID()}`;
    const resViewer = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: viewerSession.cookie,
        "x-csrf-token": viewerSession.csrf,
        "idempotency-key": viewerKey,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(resViewer.statusCode).toBe(403);

    // Outsider compiles -> not found 404
    const outsiderKey = `idemp-key-s06-t01-${randomUUID()}`;
    const resOutsider = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: outsiderSession.cookie,
        "x-csrf-token": outsiderSession.csrf,
        "idempotency-key": outsiderKey,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(resOutsider.statusCode).toBe(404);
  });

  it("handles worker lifecycle claiming, heartbeat, cancellation, and recovery", async () => {
    const session = await getSession(owner.email);
    const key = `idemp-key-s06-t01-${randomUUID()}`;

    // Enqueue job
    const enqRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const job = enqRes.json();

    // Worker claims the job
    const worker = new CompilationWorker(fixture.db);
    const claimResult = await worker.processNextJob({ leaseMs: 60_000 });
    expect(claimResult.job).not.toBeNull();
    expect(claimResult.job?.id).toBe(job.id);
    expect(claimResult.job?.status).toBe("running");

    // Fetch job via GET
    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${job.id}`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().status).toBe("running");

    // Request cancel while running
    const cancelRes = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/compilations/${job.id}`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe("cancel_requested");

    // Recover stale expired cancel_requested jobs
    const recovered = await worker.recoverStale({
      now: new Date(Date.now() + 120_000),
    });
    expect(recovered).toBeGreaterThanOrEqual(1);

    const getCancelled = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${job.id}`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });
    expect(getCancelled.statusCode).toBe(200);
    expect(getCancelled.json().status).toBe("cancelled");
  });

  it("paginates compile jobs with cursor and limits", async () => {
    const session = await getSession(owner.email);

    const listRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations?limit=2`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });

    expect(listRes.statusCode).toBe(200);
    const page = listRes.json();
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items.length).toBeLessThanOrEqual(2);
    if (page.nextCursor) {
      const nextRes = await fixture.app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectId}/compilations?limit=2&cursor=${page.nextCursor}`,
        headers: {
          origin,
          cookie: session.cookie,
        },
      });
      expect(nextRes.statusCode).toBe(200);
      expect(Array.isArray(nextRes.json().items)).toBe(true);
    }
  });

  it("executes jobs with a compiler executor and updates status to succeeded with artifacts", async () => {
    const session = await getSession(owner.email);
    const key = `idemp-key-s06-t01-${randomUUID()}`;

    const enqRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const job = enqRes.json();

    const mockExecutor: CompilerExecutor = {
      async execute(_input) {
        return {
          status: "succeeded",
          exitCode: 0,
          diagnostics: [],
          artifacts: [
            {
              name: "output.pdf",
              mime: "application/pdf",
              bytes: new Uint8Array([37, 80, 68, 70]),
              sha256: "test-pdf-sha256",
            },
          ],
        };
      },
    };

    const worker = new CompilationWorker(fixture.db, mockExecutor);
    const processed = await worker.processNextJob();
    expect(processed.completed).toBe(true);
    expect(processed.job?.status).toBe("succeeded");
    expect(processed.job?.pdf_available).toBe(true);

    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/compilations/${job.id}`,
      headers: {
        origin,
        cookie: session.cookie,
      },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().status).toBe("succeeded");
    expect(getRes.json().pdfAvailable).toBe(true);
  });
});
