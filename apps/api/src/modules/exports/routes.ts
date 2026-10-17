import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { isUUID, type DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";
import { buildSourceZip, SourceExportError } from "@latex-collab/storage/source-export";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;
type Kind = "source" | "pdf" | "log";
type Role = "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER";
type Selection = {
  projectId: string;
  revisionId: string;
  kind: Kind;
  compileJobId?: string;
  actorId: string;
  role: Role;
};

function selection(raw: Record<string, unknown>, actorId: string, role: Role): Selection {
  const { projectId, revisionId, kind, compileJobId } = raw;
  if (
    !isUUID(projectId) ||
    !isUUID(revisionId) ||
    (kind !== "source" && kind !== "pdf" && kind !== "log") ||
    (kind === "source"
      ? compileJobId !== undefined && compileJobId !== null
      : !isUUID(compileJobId))
  )
    throw new AuthError(400, "VALIDATION_ERROR");
  return {
    projectId,
    revisionId,
    kind,
    actorId,
    role,
    ...(kind === "source" ? {} : { compileJobId: compileJobId as string }),
  };
}

/** Resolve one exact frozen revision and, for build output, one exact compile job. */
export async function selectRevisionExport(
  db: DatabaseClient,
  storage: StorageAdapter,
  input: Selection,
) {
  if (!isUUID(input.projectId) || !isUUID(input.revisionId) || !isUUID(input.actorId))
    throw new AuthError(400, "VALIDATION_ERROR");
  if (input.kind === "source" && input.role !== "OWNER" && input.role !== "EDITOR")
    throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
  const revision = (
    await db.query<{ revision_no: string }>(
      "SELECT revision_no FROM project_revisions WHERE id = $1 AND project_id = $2",
      [input.revisionId, input.projectId],
    )
  ).rows[0];
  if (!revision) throw new AuthError(404, "RESOURCE_NOT_FOUND");
  if (input.kind === "source") {
    const archive = await buildSourceZip(db, storage, {
      projectId: input.projectId,
      actorId: input.actorId,
      revisionNo: Number(revision.revision_no),
    });
    return {
      bytes: archive.bytes,
      contentType: "application/zip",
      filename: `source-revision-${archive.revisionNo}.zip`,
    };
  }
  if (!input.compileJobId || !isUUID(input.compileJobId))
    throw new AuthError(400, "VALIDATION_ERROR");
  const artifact = (
    await db.query<{
      status: string;
      pdf_key: string | null;
      log_key: string | null;
      expires_at: Date | null;
    }>(
      `SELECT j.status, a.pdf_key, a.log_key, a.expires_at FROM compile_jobs j
       JOIN artifact_sets a ON a.compile_job_id = j.id
       WHERE j.id = $1 AND j.project_id = $2 AND j.source_revision_id = $3`,
      [input.compileJobId, input.projectId, input.revisionId],
    )
  ).rows[0];
  if (!artifact || (artifact.expires_at && artifact.expires_at.getTime() <= Date.now()))
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  const filename = input.kind === "pdf" ? "output.pdf" : "compile.log";
  if (input.kind === "pdf" && artifact.status !== "succeeded")
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  const key = input.kind === "pdf" ? artifact.pdf_key : artifact.log_key;
  if (key !== `projects/${input.projectId}/artifacts/${input.compileJobId}/${filename}`)
    throw new AuthError(404, "RESOURCE_NOT_FOUND");
  let bytes: Uint8Array;
  try {
    bytes = await storage.getLimited(key, MAX_ARTIFACT_BYTES);
  } catch {
    throw new AuthError(503, "SERVICE_UNAVAILABLE");
  }
  if (input.kind === "pdf" && Buffer.from(bytes).subarray(0, 5).toString() !== "%PDF-")
    throw new AuthError(422, "UNSUPPORTED_CONTENT");
  return {
    bytes: Buffer.from(bytes),
    filename,
    contentType: input.kind === "pdf" ? "application/pdf" : "text/plain; charset=utf-8",
  };
}

function sendError(error: unknown, reply: FastifyReply, requestId: string) {
  const known = error instanceof AuthError ? error : null;
  const status = known?.status ?? (error instanceof SourceExportError ? error.status : 503);
  const code =
    known?.code ??
    (error instanceof SourceExportError
      ? error.status === 404
        ? "RESOURCE_NOT_FOUND"
        : "UNSUPPORTED_CONTENT"
      : "SERVICE_UNAVAILABLE");
  return reply
    .code(status)
    .type("application/problem+json")
    .send(problem(status, code, requestId));
}

export function registerRevisionExportRoutes(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined; storage?: StorageAdapter | undefined },
): void {
  function deps() {
    if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
    return { db: options.db, storage: options.storage };
  }
  function auth(request: { projectAuthorization?: unknown }) {
    const value = request.projectAuthorization as { userId: string; role: Role } | undefined;
    if (!value) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
    return { actorId: value.userId, role: value.role };
  }
  async function send(input: Selection, reply: FastifyReply) {
    const { db, storage } = deps();
    const result = await selectRevisionExport(db, storage, input);
    return reply
      .header("cache-control", "private, no-store")
      .header("content-disposition", `attachment; filename="${result.filename}"`)
      .type(result.contentType)
      .send(result.bytes);
  }

  app.get(
    "/api/v1/projects/:projectId/revisions/:revisionId/exports/:kind",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        const raw = { ...(request.params as object), ...(request.query as object) };
        return await send(selection(raw, auth(request).actorId, auth(request).role), reply);
      } catch (error) {
        return sendError(error, reply, request.id);
      }
    },
  );

  app.post(
    "/api/v1/projects/:projectId/revisions/:revisionId/exports/links",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        const { db, storage } = deps();
        if (
          typeof request.body !== "object" ||
          !request.body ||
          Array.isArray(request.body) ||
          Object.keys(request.body).some((key) => key !== "kind" && key !== "compileJobId")
        )
          throw new AuthError(400, "VALIDATION_ERROR");
        const input = selection(
          { ...(request.params as object), ...(request.body as object) },
          auth(request).actorId,
          auth(request).role,
        );
        // Validate the exact artifact exists before issuing a link; source validation also
        // verifies the frozen ZIP and current export permission.
        await selectRevisionExport(db, storage, input);
        const id = randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await db.query(
          `INSERT INTO revision_export_links
           (id, project_id, revision_id, compile_job_id, kind, created_by, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            input.projectId,
            input.revisionId,
            input.compileJobId ?? null,
            input.kind,
            input.actorId,
            expiresAt,
          ],
        );
        return reply.code(201).send({
          id,
          expiresAt: expiresAt.toISOString(),
          url: `/api/v1/projects/${input.projectId}/exports/links/${id}`,
        });
      } catch (error) {
        return sendError(error, reply, request.id);
      }
    },
  );

  app.get(
    "/api/v1/projects/:projectId/exports/links/:linkId",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        const { db } = deps();
        const { projectId, linkId } = request.params as { projectId: string; linkId: string };
        if (!isUUID(projectId) || !isUUID(linkId)) throw new AuthError(400, "VALIDATION_ERROR");
        const row = (
          await db.query<{
            revision_id: string;
            compile_job_id: string | null;
            kind: Kind;
            expires_at: Date;
          }>(
            `SELECT revision_id, compile_job_id, kind, expires_at FROM revision_export_links
           WHERE id = $1 AND project_id = $2`,
            [linkId, projectId],
          )
        ).rows[0];
        if (!row) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        if (row.expires_at.getTime() <= Date.now()) throw new AuthError(410, "LINK_EXPIRED");
        return await send(
          selection(
            {
              projectId,
              revisionId: row.revision_id,
              kind: row.kind,
              compileJobId: row.compile_job_id,
            },
            auth(request).actorId,
            auth(request).role,
          ),
          reply,
        );
      } catch (error) {
        return sendError(error, reply, request.id);
      }
    },
  );
}
