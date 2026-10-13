import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  importJobViewSchema,
  importPresignRequestSchema,
  importRequestSchema,
  type ImportJobView,
} from "@latex-collab/contracts";
import { isUUID, type DatabaseClient, PersistenceError } from "@latex-collab/db";
import {
  ImportJobRepository,
  type ImportJobView as StoredImportJob,
} from "@latex-collab/db/repositories/import-jobs";
import {
  StorageLimitError,
  type StorageAdapter,
  assertImportKeyScope,
  buildImportUploadKey,
  maxArchiveBytes,
} from "@latex-collab/storage";
import { problem } from "../../plugins/errors.js";
import { AuthError } from "../auth/errors.js";

const signedPutSeconds = 300;

type ImportIntent = {
  id: string;
  actor_id: string;
  expected_size: string;
  expected_sha256: string;
  staging_key: string;
  expires_at: Date;
  completed_job_id: string | null;
  completed_key_hash: string | null;
};

function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toView(job: StoredImportJob): ImportJobView {
  return importJobViewSchema.parse({
    id: job.id,
    status: job.status,
    title: job.title,
    projectId: job.projectId,
    errorCode: job.errorCode,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}

function idempotencyKeyHash(request: FastifyRequest): string {
  const raw = request.headers["idempotency-key"];
  if (typeof raw !== "string" || raw.length < 16 || raw.length > 128) {
    throw new AuthError(400, "VALIDATION_ERROR");
  }
  return digest(raw);
}

function handleError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof StorageLimitError) {
    return reply
      .code(413)
      .type("application/problem+json")
      .send(problem(413, "QUOTA_EXCEEDED", requestId));
  }
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  if (error instanceof PersistenceError && error.code === "CONSTRAINT_VIOLATION") {
    return reply
      .code(409)
      .type("application/problem+json")
      .send(problem(409, "REVISION_CONFLICT", requestId));
  }
  return reply
    .code(503)
    .type("application/problem+json")
    .send(problem(503, "SERVICE_UNAVAILABLE", requestId));
}

export function registerImportRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    storage?: StorageAdapter | undefined;
  },
): void {
  app.post(
    "/api/v1/projects/imports/presign",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = request.sessionIdentity;
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const parsed = importPresignRequestSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
        if (parsed.data.sizeBytes > maxArchiveBytes) throw new AuthError(413, "QUOTA_EXCEEDED");
        const uploadId = randomUUID();
        const stagingKey = buildImportUploadKey(identity.userId, uploadId);
        const expiresAt = new Date(Date.now() + signedPutSeconds * 1000);
        const url = await options.storage.presign(stagingKey, "put", signedPutSeconds);
        await options.db.query(
          `INSERT INTO import_upload_intents
             (id, actor_id, expected_size, expected_sha256, staging_key, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            uploadId,
            identity.userId,
            parsed.data.sizeBytes,
            parsed.data.sha256,
            stagingKey,
            expiresAt,
          ],
        );
        return reply.code(200).send({ uploadId, url, expiresAt: expiresAt.toISOString() });
      } catch (error) {
        return handleError(error, reply, request.id);
      }
    },
  );

  app.post(
    "/api/v1/projects/imports",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = request.sessionIdentity;
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const keyHash = idempotencyKeyHash(request);
        const parsed = importRequestSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
        const input = parsed.data;
        const jobs = new ImportJobRepository(options.db);
        const found = await options.db.query<ImportIntent>(
          "SELECT * FROM import_upload_intents WHERE id = $1 AND actor_id = $2",
          [input.uploadId, identity.userId],
        );
        const intent = found.rows[0];
        if (!intent) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        if (intent.completed_job_id) {
          if (intent.completed_key_hash !== keyHash) {
            throw new AuthError(409, "REVISION_CONFLICT");
          }
          const finished = await jobs.get(intent.completed_job_id);
          if (!finished || finished.actorId !== identity.userId) {
            throw new AuthError(404, "RESOURCE_NOT_FOUND");
          }
          if (finished.title !== input.title) {
            throw new AuthError(409, "REVISION_CONFLICT");
          }
          return reply.code(202).send(toView(finished));
        }
        if (intent.expires_at.getTime() <= Date.now()) {
          throw new AuthError(422, "UNSUPPORTED_CONTENT");
        }
        assertImportKeyScope(intent.staging_key, identity.userId);
        const object = await options.storage.head(intent.staging_key);
        if (!object) throw new AuthError(422, "UNSUPPORTED_CONTENT");
        if (object.sizeBytes > maxArchiveBytes) throw new AuthError(413, "QUOTA_EXCEEDED");
        if (object.sizeBytes !== Number(intent.expected_size)) {
          throw new AuthError(422, "UNSUPPORTED_CONTENT");
        }
        const bytes = Buffer.from(
          await options.storage.getLimited(intent.staging_key, maxArchiveBytes),
        );
        if (
          bytes.length !== Number(intent.expected_size) ||
          digest(bytes) !== intent.expected_sha256
        ) {
          throw new AuthError(422, "UNSUPPORTED_CONTENT");
        }
        const rawKey = request.headers["idempotency-key"];
        if (typeof rawKey !== "string") throw new AuthError(400, "VALIDATION_ERROR");
        let job = (
          await jobs.reserve({
            actorId: identity.userId,
            idempotencyKey: rawKey,
            archiveSha256: digest(bytes),
            archiveSize: bytes.length,
            title: input.title,
          })
        ).job;
        if (job.status === "staging") {
          assertImportKeyScope(job.archiveKey, identity.userId);
          const stored = await options.storage.put(job.archiveKey, bytes, "application/zip");
          if (stored.sha256 !== digest(bytes) || stored.sizeBytes !== bytes.length) {
            throw new AuthError(503, "SERVICE_UNAVAILABLE");
          }
          job = await jobs.enqueue(job.id, {
            archiveSha256: digest(bytes),
            archiveSize: bytes.length,
          });
        } else {
          const current = await jobs.get(job.id);
          if (!current) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          job = current;
        }
        await options.db.query(
          `UPDATE import_upload_intents
              SET completed_job_id = $1, completed_key_hash = $2
            WHERE id = $3 AND completed_job_id IS NULL`,
          [job.id, keyHash, input.uploadId],
        );
        return reply.code(202).send(toView(job));
      } catch (error) {
        return handleError(error, reply, request.id);
      }
    },
  );

  app.get(
    "/api/v1/projects/imports/:jobId",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = request.sessionIdentity;
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const jobId = (request.params as { jobId?: unknown } | undefined)?.jobId;
        if (!isUUID(jobId)) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }
        const job = await new ImportJobRepository(options.db).get(jobId);
        if (!job || job.actorId !== identity.userId) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }
        return reply.code(200).send(toView(job));
      } catch (error) {
        return handleError(error, reply, request.id);
      }
    },
  );
}
