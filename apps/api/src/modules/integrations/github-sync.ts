import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { isUUID, type DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";
import {
  createGitHubPullService,
  GitHubPullError,
  parseSyncBase,
} from "@latex-collab/jobs/sync/github-pull";
import {
  createGitHubApplyService,
  type GitHubApplyReader,
  type SyncInvalidationPublisher,
} from "@latex-collab/jobs/sync/apply-changes";
import {
  createGitHubPushService,
  type GitHubPushWriter,
} from "@latex-collab/jobs/sync/github-push";
import { DefaultTextDocumentService } from "../text/text-document-service.js";
import { AuthError } from "../auth/errors.js";
import { decryptToken, type GitHubOAuthConfig } from "./github-auth.js";
import { problem } from "../../plugins/errors.js";

const SHA = /^[a-f0-9]{40}$/;
const KEY = /^[A-Za-z0-9._:-]{16,128}$/;
type SyncBody = {
  direction: "pull" | "push";
  sourceRevisionId: string;
  expectedRemoteRevision: string;
  resolutions?: Array<{ path: string; decision: "keep-local" | "keep-remote" | "manual" }>;
};

export interface GitHubSyncRouteOptions {
  db?: DatabaseClient | undefined;
  storage?: StorageAdapter | undefined;
  config?: GitHubOAuthConfig | undefined;
  reader?: GitHubApplyReader | undefined;
  writer?: GitHubPushWriter | undefined;
  invalidations?: SyncInvalidationPublisher | undefined;
}

function parseBody(raw: unknown): SyncBody {
  if (typeof raw !== "object" || !raw) throw new AuthError(400, "VALIDATION_ERROR");
  const body = raw as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        !["direction", "sourceRevisionId", "expectedRemoteRevision", "resolutions"].includes(key),
    )
  )
    throw new AuthError(400, "VALIDATION_ERROR");
  if (
    (body.direction !== "pull" && body.direction !== "push") ||
    !isUUID(body.sourceRevisionId) ||
    typeof body.expectedRemoteRevision !== "string" ||
    !SHA.test(body.expectedRemoteRevision)
  )
    throw new AuthError(400, "VALIDATION_ERROR");
  if (body.resolutions !== undefined && !Array.isArray(body.resolutions))
    throw new AuthError(400, "VALIDATION_ERROR");
  const resolutions = (body.resolutions ?? []) as unknown[];
  if (
    resolutions.length > 2000 ||
    resolutions.some((item) => {
      if (typeof item !== "object" || !item) return true;
      const value = item as Record<string, unknown>;
      return (
        typeof value.path !== "string" ||
        value.path.length < 1 ||
        value.path.length > 1000 ||
        !["keep-local", "keep-remote", "manual"].includes(String(value.decision))
      );
    })
  )
    throw new AuthError(400, "VALIDATION_ERROR");
  if (body.direction === "push" && resolutions.length) throw new AuthError(400, "VALIDATION_ERROR");
  return {
    direction: body.direction,
    sourceRevisionId: body.sourceRevisionId as string,
    expectedRemoteRevision: body.expectedRemoteRevision,
    resolutions: resolutions as NonNullable<SyncBody["resolutions"]>,
  };
}

function sendError(error: unknown, reply: FastifyReply, requestId: string) {
  const known = error instanceof AuthError || error instanceof GitHubPullError ? error : null;
  const status = known?.status ?? 503;
  const code = known?.code ?? "SERVICE_UNAVAILABLE";
  return reply
    .code(status)
    .type("application/problem+json")
    .send(problem(status, code, requestId));
}

/** A status request freezes the local state; it must therefore be POST and CSRF guarded. */
export function registerGitHubSyncRoutes(
  app: FastifyInstance,
  options: GitHubSyncRouteOptions,
): void {
  function dependencies() {
    if (
      !options.db ||
      !options.storage ||
      !options.config ||
      !options.reader ||
      !options.writer ||
      !options.invalidations
    )
      throw new AuthError(503, "SERVICE_UNAVAILABLE");
    return {
      db: options.db,
      storage: options.storage,
      config: options.config,
      reader: options.reader,
      writer: options.writer,
      invalidations: options.invalidations,
    };
  }
  async function link(db: DatabaseClient, projectId: string) {
    const result = await db.query<{
      remote_ref: string;
      branch: string;
      sync_cursor: string;
      sync_base_manifest: unknown;
    }>(
      `SELECT remote_ref, branch, sync_cursor, sync_base_manifest FROM project_integrations
       WHERE project_id = $1 AND provider = 'github' ORDER BY remote_ref ASC LIMIT 2`,
      [projectId],
    );
    if (result.rows.length > 1) throw new AuthError(409, "REMOTE_CONFLICT");
    const row = result.rows[0];
    if (!row || !row.sync_cursor || !SHA.test(row.sync_cursor))
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    return row;
  }
  function actor(request: { projectAuthorization?: unknown; params: unknown }) {
    const { projectId } = request.params as { projectId: string };
    const auth = request.projectAuthorization as { userId: string } | undefined;
    if (!auth || !isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");
    return { actorUserId: auth.userId, projectId };
  }

  app.post(
    "/api/v1/projects/:projectId/integrations/github/status",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        const { db, config, reader } = dependencies();
        const identity = actor(request);
        const row = await link(db, identity.projectId);
        const service = createGitHubPullService({
          db,
          reader,
          decryptCredential: (ref: string) => decryptToken(config.encryptionKey, ref),
        });
        const plan = await service.pull({
          ...identity,
          remoteRef: row.remote_ref,
          branch: row.branch,
          expectedRemoteSha: row.sync_cursor,
        });
        return reply.code(200).send({
          id: identity.projectId,
          status: plan.status === "changes" ? "sync_pending" : plan.status,
          sourceRevisionId: plan.localRevisionId,
          remoteRevision: plan.remoteSha,
          conflicts: plan.conflicts,
          entries: plan.entries,
          base: parseSyncBase(row.sync_base_manifest),
        });
      } catch (error) {
        return sendError(error, reply, request.id);
      }
    },
  );

  app.post(
    "/api/v1/projects/:projectId/integrations/github/sync",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        const { db, storage, config, reader, writer, invalidations } = dependencies();
        const identity = actor(request);
        const body = parseBody(request.body);
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || !KEY.test(key)) throw new AuthError(400, "VALIDATION_ERROR");
        const row = await link(db, identity.projectId);
        const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
        const requestId = randomUUID();
        const claimed = await db.query(
          `INSERT INTO github_sync_requests (id, project_id, actor_id, idempotency_key, request_hash)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [requestId, identity.projectId, identity.actorUserId, key, digest],
        );
        if (claimed.rowCount !== 1) {
          const previous = await db.query<{
            request_hash: string;
            result_json: { id: string; status: string } | null;
          }>(
            `SELECT request_hash, result_json FROM github_sync_requests
             WHERE project_id = $1 AND actor_id = $2 AND idempotency_key = $3`,
            [identity.projectId, identity.actorUserId, key],
          );
          const record = previous.rows[0];
          if (!record || record.request_hash !== digest || !record.result_json)
            throw new AuthError(409, "REVISION_CONFLICT");
          return reply.code(200).send(record.result_json);
        }
        if (body.expectedRemoteRevision !== row.sync_cursor)
          throw new AuthError(409, "REMOTE_CONFLICT");
        const decryptCredential = (ref: string) => decryptToken(config.encryptionKey, ref);
        if (body.direction === "pull") {
          const service = createGitHubApplyService({
            db,
            storage,
            reader,
            decryptCredential,
            canonicalText: new DefaultTextDocumentService(db),
            invalidations,
          });
          await service.apply({
            ...identity,
            remoteRef: row.remote_ref,
            branch: row.branch,
            expectedRemoteSha: body.expectedRemoteRevision,
            sourceRevisionId: body.sourceRevisionId,
            ...(body.resolutions ? { resolutions: body.resolutions } : {}),
          });
        } else {
          const service = createGitHubPushService({ db, storage, writer, decryptCredential });
          await service.push({
            ...identity,
            remoteRef: row.remote_ref,
            branch: row.branch,
            expectedRemoteSha: body.expectedRemoteRevision,
            sourceRevisionId: body.sourceRevisionId,
          });
        }
        const result = { id: requestId, status: "succeeded" };
        await db.query("UPDATE github_sync_requests SET result_json = $2::jsonb WHERE id = $1", [
          requestId,
          JSON.stringify(result),
        ]);
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(error, reply, request.id);
      }
    },
  );
}
