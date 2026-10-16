import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { isUUID, type DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";
import { buildSourceZip, SourceExportError } from "@latex-collab/storage/source-export";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

const maxDownloadBytes = 25 * 1024 * 1024;
const inlineTypes = new Set(["image/png", "image/jpeg", "application/pdf"]);

type Node = {
  id: string;
  name: string;
  kind: "FILE" | "FOLDER";
  content_kind: "TEXT" | "BINARY";
  mime: string;
  blob_key: string | null;
};

function encodeFilename(name: string): string {
  return encodeURIComponent(name).replace(/['()]/g, (part) => `%${part.charCodeAt(0).toString(16)}`);
}

function handleDownloadError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  if (error instanceof SourceExportError) {
    const code = error.status === 404 ? "RESOURCE_NOT_FOUND" : "UNSUPPORTED_CONTENT";
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, code, requestId));
  }
  return reply
    .code(503)
    .type("application/problem+json")
    .send(problem(503, "SERVICE_UNAVAILABLE", requestId));
}

export function registerBinaryDownloadRoutes(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined; storage?: StorageAdapter | undefined },
): void {
  /**
   * Serves one binary node through per-request READ authorization. Permitted
   * images and PDFs render inline; every other binary (including legacy
   * active content the upload policy would reject today) downloads as an
   * inert octet-stream attachment with nosniff, so it never executes in the
   * trusted UI. No object key or signed URL ever reaches the browser.
   */
  app.get(
    "/api/v1/projects/:projectId/files/:fileId/download",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, fileId } = request.params as { projectId: string; fileId: string };
        if (!isUUID(projectId) || !isUUID(fileId)) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }
        const nodeRes = await options.db.query<Node>(
          `SELECT id, name, kind, content_kind, mime, blob_key FROM project_nodes
            WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
          [fileId, projectId],
        );
        const node = nodeRes.rows[0];
        if (
          !node ||
          node.kind !== "FILE" ||
          node.content_kind !== "BINARY" ||
          !node.blob_key?.startsWith(`projects/${projectId}/blobs/`)
        ) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }
        let bytes: Uint8Array;
        try {
          bytes = await options.storage.getLimited(node.blob_key, maxDownloadBytes);
        } catch {
          throw new AuthError(503, "SERVICE_UNAVAILABLE");
        }
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (node.blob_key !== `projects/${projectId}/blobs/${digest}`) {
          throw new AuthError(422, "UNSUPPORTED_CONTENT");
        }
        const inline = inlineTypes.has(node.mime);
        const body = Buffer.from(bytes);
        void reply.header("x-content-type-options", "nosniff");
        void reply.header("cache-control", "no-store");
        if (inline) {
          void reply.header("content-disposition", "inline");
          return reply.type(node.mime).send(body);
        }
        void reply.header(
          "content-disposition",
          `attachment; filename*=UTF-8''${encodeFilename(node.name)}`,
        );
        return reply.type("application/octet-stream").send(body);
      } catch (error) {
        return handleDownloadError(error, reply, request.id);
      }
    },
  );

  /**
   * Downloads the deterministic source ZIP for one frozen revision. Source
   * export requires an explicit OWNER/EDITOR capability: reviewers and
   * viewers read content but receive 403 here, per the authorization matrix.
   */
  app.get(
    "/api/v1/projects/:projectId/export",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params as { projectId: string };
        const { revisionNo: revisionRaw } = request.query as { revisionNo?: unknown };
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");
        const revisionNo = typeof revisionRaw === "string" ? Number(revisionRaw) : NaN;
        if (!Number.isSafeInteger(revisionNo) || (revisionNo as number) < 1) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }
        const auth = request.projectAuthorization as
          | { userId: string; projectId: string }
          | undefined;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const projRes = await options.db.query<{ owner_id: string; status: string }>(
          "SELECT owner_id, status FROM projects WHERE id = $1",
          [projectId],
        );
        const proj = projRes.rows[0];
        if (!proj || proj.status === "trashed") throw new AuthError(404, "RESOURCE_NOT_FOUND");
        if (proj.owner_id !== auth.userId) {
          const memberRes = await options.db.query<{ role: string }>(
            "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
            [projectId, auth.userId],
          );
          const role = memberRes.rows[0]?.role;
          if (!role) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          if (role === "REVIEWER" || role === "VIEWER") {
            throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
          }
        }
        const result = await buildSourceZip(options.db, options.storage, {
          projectId,
          actorId: auth.userId,
          revisionNo: revisionNo as number,
        });
        void reply.header("x-content-type-options", "nosniff");
        void reply.header(
          "content-disposition",
          `attachment; filename="source-revision-${result.revisionNo}.zip"`,
        );
        return reply.type("application/zip").send(result.bytes);
      } catch (error) {
        return handleDownloadError(error, reply, request.id);
      }
    },
  );
}
