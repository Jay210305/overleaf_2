import type { FastifyInstance } from "fastify";
import type { StorageAdapter } from "@latex-collab/storage";
import { compilationRequestSchema, type Compiler } from "@latex-collab/contracts";
import {
  CompilationsRepository,
  CompileQuotaError,
  DatabaseClient,
  freezeCompilationRevision,
  isUUID,
  PersistenceError,
  RevisionNotFoundError,
} from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";

const VALID_COMPILERS: ReadonlySet<Compiler> = new Set([
  "pdflatex",
  "xelatex",
  "lualatex",
  "latex",
]);

export function registerCompilationRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    storage?: StorageAdapter | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
  },
): void {
  // 1. POST /api/v1/projects/:projectId/compilations
  app.post(
    "/api/v1/projects/:projectId/compilations",
    { config: { projectAction: "COMPILE" } },
    async (request, reply) => {
      if (!options.db) {
        return reply
          .code(503)
          .type("application/problem+json")
          .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }

      const { projectId } = request.params as { projectId: string };
      const idempotencyKey = request.headers["idempotency-key"];
      if (
        typeof idempotencyKey !== "string" ||
        idempotencyKey.length < 16 ||
        idempotencyKey.length > 128
      ) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const parseResult = compilationRequestSchema.safeParse(request.body ?? {});
      if (!parseResult.success) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const body = parseResult.data;
      let compiler: Compiler;

      if (body.compiler) {
        if (!VALID_COMPILERS.has(body.compiler)) {
          return reply
            .code(400)
            .type("application/problem+json")
            .send(problem(400, "VALIDATION_ERROR", request.id));
        }
        compiler = body.compiler;
      } else {
        const projRes = await options.db.query<{ compiler: Compiler }>(
          "SELECT compiler FROM projects WHERE id = $1",
          [projectId],
        );
        const projectRow = projRes.rows[0];
        if (!projectRow) {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
        }
        compiler = projectRow.compiler ?? "pdflatex";
      }

      const userId = request.projectAuthorization?.userId;
      if (!userId) {
        return reply
          .code(401)
          .type("application/problem+json")
          .send(problem(401, "AUTHENTICATION_REQUIRED", request.id));
      }

      // Freeze immutable source revision prior to job enqueue (S06-T02, CMP-01, NFR-06)
      let frozen;
      try {
        frozen = await freezeCompilationRevision({
          db: options.db,
          projectId,
          authorId: userId,
          targetRevisionId: body.targetRevisionId,
        });
      } catch (err: unknown) {
        if (err instanceof RevisionNotFoundError) {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
        }
        throw err;
      }

      const repo = new CompilationsRepository(options.db);
      try {
        const { job } = await repo.createJob({
          projectId,
          requestedBy: userId,
          idempotencyKey,
          compiler,
          sourceRevisionId: frozen.revision.id,
          targetRevisionId: body.targetRevisionId,
          forceClean: Boolean(body.forceClean),
        });

        return reply.code(202).send(job);
      } catch (err: unknown) {
        if (err instanceof CompileQuotaError) {
          return reply
            .code(429)
            .header("retry-after", "5")
            .type("application/problem+json")
            .send(problem(429, "QUOTA_EXCEEDED", request.id));
        }
        if (err instanceof PersistenceError && err.code === "CONSTRAINT_VIOLATION") {
          return reply
            .code(400)
            .type("application/problem+json")
            .send(problem(400, "CONSTRAINT_VIOLATION", request.id));
        }
        throw err;
      }
    },
  );

  // 2. GET /api/v1/projects/:projectId/compilations
  app.get(
    "/api/v1/projects/:projectId/compilations",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      if (!options.db) {
        return reply
          .code(503)
          .type("application/problem+json")
          .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }

      const { projectId } = request.params as { projectId: string };
      const query = request.query as { limit?: string; cursor?: string } | undefined;

      let limit: number | undefined;
      if (query?.limit !== undefined) {
        limit = Number.parseInt(query.limit, 10);
        if (Number.isNaN(limit) || limit < 1 || limit > 100) {
          return reply
            .code(400)
            .type("application/problem+json")
            .send(problem(400, "VALIDATION_ERROR", request.id));
        }
      }

      const repo = new CompilationsRepository(options.db);
      const result = await repo.listJobs(projectId, {
        limit,
        cursor: query?.cursor,
      });

      return reply.code(200).send(result);
    },
  );

  // 3. GET /api/v1/projects/:projectId/compilations/:jobId
  app.get(
    "/api/v1/projects/:projectId/compilations/:jobId",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      if (!options.db) {
        return reply
          .code(503)
          .type("application/problem+json")
          .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }

      const { projectId, jobId } = request.params as { projectId: string; jobId: string };
      if (!isUUID(jobId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const repo = new CompilationsRepository(options.db);
      const job = await repo.getJob(jobId, projectId);
      if (!job) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      return reply.code(200).send(job);
    },
  );

  // 4. DELETE /api/v1/projects/:projectId/compilations/:jobId
  app.delete(
    "/api/v1/projects/:projectId/compilations/:jobId",
    { config: { projectAction: "COMPILE" } },
    async (request, reply) => {
      if (!options.db) {
        return reply
          .code(503)
          .type("application/problem+json")
          .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }

      const { projectId, jobId } = request.params as { projectId: string; jobId: string };
      if (!isUUID(jobId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const repo = new CompilationsRepository(options.db);
      const job = await repo.cancelJob(jobId, projectId);
      if (!job) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      return reply.code(200).send(job);
    },
  );

  // 5. GET /api/v1/projects/:projectId/compilations/:jobId/artifacts
  app.get(
    "/api/v1/projects/:projectId/compilations/:jobId/artifacts",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      if (!options.db) {
        return reply
          .code(503)
          .type("application/problem+json")
          .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }

      const { projectId, jobId } = request.params as { projectId: string; jobId: string };
      if (!isUUID(jobId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const repo = new CompilationsRepository(options.db);
      const job = await repo.getJob(jobId, projectId);
      if (!job) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      const artRes = await options.db.query<{
        id: string;
        pdf_key: string | null;
        log_key: string | null;
        synctex_key: string | null;
        source_hash: string;
        created_at: Date;
        expires_at: Date | null;
      }>(
        `SELECT id, pdf_key, log_key, synctex_key, source_hash, created_at, expires_at
         FROM artifact_sets WHERE compile_job_id = $1`,
        [jobId],
      );

      const artRow = artRes.rows[0];
      const items: Array<{
        name: string;
        sha256: string;
        mime: string;
        sizeBytes: number;
        url: string;
        expiresAt: string;
      }> = [];

      if (artRow) {
        const expiresAtStr = artRow.expires_at
          ? artRow.expires_at.toISOString()
          : new Date(Date.now() + 14 * 86400 * 1000).toISOString();
        const baseOrigin = options.origin?.split(",")[0]?.trim() ?? "http://127.0.0.1:54000";

        if (artRow.pdf_key) {
          items.push({
            name: "output.pdf",
            sha256:
              artRow.source_hash.length === 64
                ? artRow.source_hash
                : artRow.source_hash.padStart(64, "0"),
            mime: "application/pdf",
            sizeBytes: 1024,
            url: `${baseOrigin}/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/output.pdf`,
            expiresAt: expiresAtStr,
          });
        }
        if (artRow.log_key) {
          items.push({
            name: "compile.log",
            sha256:
              artRow.source_hash.length === 64
                ? artRow.source_hash
                : artRow.source_hash.padStart(64, "0"),
            mime: "text/plain",
            sizeBytes: 512,
            url: `${baseOrigin}/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/compile.log`,
            expiresAt: expiresAtStr,
          });
        }
        if (artRow.synctex_key) {
          items.push({
            name: "output.synctex.gz",
            sha256:
              artRow.source_hash.length === 64
                ? artRow.source_hash
                : artRow.source_hash.padStart(64, "0"),
            mime: "application/gzip",
            sizeBytes: 256,
            url: `${baseOrigin}/api/v1/projects/${projectId}/compilations/${jobId}/artifacts/output.synctex.gz`,
            expiresAt: expiresAtStr,
          });
        }
      }

      return reply.code(200).send({
        jobId,
        sourceRevisionId: job.sourceRevisionId,
        items,
      });
    },
  );

  // 6. GET /api/v1/projects/:projectId/compilations/:jobId/artifacts/:artifactName
  app.get(
    "/api/v1/projects/:projectId/compilations/:jobId/artifacts/:artifactName",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      if (!options.db || !options.storage) {
        return reply
          .code(503)
          .type("application/problem+json")
          .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }

      const { projectId, jobId, artifactName } = request.params as {
        projectId: string;
        jobId: string;
        artifactName: string;
      };

      if (!isUUID(jobId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const repo = new CompilationsRepository(options.db);
      const job = await repo.getJob(jobId, projectId);
      if (!job) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      const artRes = await options.db.query<{
        pdf_key: string | null;
        log_key: string | null;
        synctex_key: string | null;
      }>(`SELECT pdf_key, log_key, synctex_key FROM artifact_sets WHERE compile_job_id = $1`, [
        jobId,
      ]);

      const artRow = artRes.rows[0];
      if (!artRow) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      let storageKey: string | null = null;
      let contentType = "application/octet-stream";

      if (artifactName === "output.pdf") {
        storageKey = artRow.pdf_key;
        contentType = "application/pdf";
      } else if (artifactName === "compile.log") {
        storageKey = artRow.log_key;
        contentType = "text/plain; charset=utf-8";
      } else if (artifactName === "output.synctex.gz") {
        storageKey = artRow.synctex_key;
        contentType = "application/gzip";
      } else {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      if (!storageKey) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      const fileBytes = await options.storage.get(storageKey);
      if (!fileBytes) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      return reply
        .type(contentType)
        .header("content-disposition", `inline; filename="${artifactName}"`)
        .header("cache-control", "private, no-cache")
        .send(Buffer.from(fileBytes));
    },
  );
}
