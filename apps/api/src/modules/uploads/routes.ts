import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as Y from "yjs";
import {
  uploadCompleteSchema,
  uploadRequestSchema,
  type ProjectNodeView,
  type UploadRequest,
} from "@latex-collab/contracts";
import { type DatabaseClient, PersistenceError, type TransactionContext } from "@latex-collab/db";
import { StorageLimitError, type StorageAdapter } from "@latex-collab/storage";
import {
  ContentPolicyError,
  classifyUploadContent,
  maxFileBytes,
  maxProjectBytes,
  maxProjectNodes,
  verifyBinaryContent,
  verifyTextContent,
} from "@latex-collab/storage";
import { problem } from "../../plugins/errors.js";
import { AuthError } from "../auth/errors.js";
import { validateNodeName } from "../files/tree.js";

const signedPutSeconds = 300;

type UploadKind = "TEXT" | "BINARY";
type Intent = {
  id: string;
  project_id: string;
  actor_id: string;
  parent_id: string | null;
  file_name: string;
  mime: string;
  content_kind: UploadKind;
  expected_size: number;
  expected_sha256: string;
  staging_key: string;
  expires_at: Date;
  completed_node_id: string | null;
  completed_key_hash: string | null;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateRequest(
  raw: unknown,
): UploadRequest & { fileName: string; contentKind: UploadKind } {
  const parsed = uploadRequestSchema.safeParse(raw);
  if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
  const input = parsed.data;
  if (input.sizeBytes > maxFileBytes) throw new AuthError(413, "QUOTA_EXCEEDED");
  const fileName = input.fileName.normalize("NFC");
  if (validateNodeName(fileName) !== fileName || /%(?:2e|2f|5c|00)/i.test(fileName))
    throw new AuthError(400, "VALIDATION_ERROR");
  return { ...input, fileName, contentKind: classifyUploadContent(fileName, input.mime) };
}

async function ensureTarget(
  tx: TransactionContext,
  projectId: string,
  actorId: string,
  parentId: string | null,
  fileName: string,
  sizeBytes: number,
): Promise<number> {
  const project = await tx.query<{ owner_id: string; status: string; current_revision: number }>(
    "SELECT owner_id, status, current_revision FROM projects WHERE id = $1 FOR UPDATE",
    [projectId],
  );
  const row = project.rows[0];
  if (!row || row.status !== "active") throw new AuthError(404, "RESOURCE_NOT_FOUND");
  if (row.owner_id !== actorId) {
    const membership = await tx.query<{ role: string }>(
      "SELECT role FROM active_project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, actorId],
    );
    if (!membership.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
    if (!(["OWNER", "EDITOR"] as string[]).includes(membership.rows[0].role))
      throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
  }
  if (parentId !== null) {
    const parent = await tx.query<{ kind: string }>(
      "SELECT kind FROM project_nodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL",
      [parentId, projectId],
    );
    if (!parent.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
    if (parent.rows[0].kind !== "FOLDER") throw new AuthError(400, "VALIDATION_ERROR");
  }
  const duplicate = await tx.query<{ id: string }>(
    `SELECT id FROM project_nodes WHERE project_id = $1 AND parent_id IS NOT DISTINCT FROM $2::uuid
       AND name = $3 AND deleted_at IS NULL`,
    [projectId, parentId, fileName],
  );
  if (duplicate.rows[0]) throw new AuthError(409, "REVISION_CONFLICT");
  const usage = await tx.query<{ count: string; bytes: string }>(
    `SELECT COUNT(*)::text AS count, COALESCE(SUM(size_bytes), 0)::text AS bytes
       FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL`,
    [projectId],
  );
  if (
    Number(usage.rows[0]?.count ?? 0) + 1 > maxProjectNodes ||
    Number(usage.rows[0]?.bytes ?? 0) + sizeBytes > maxProjectBytes
  )
    throw new AuthError(413, "QUOTA_EXCEEDED");
  return Number(row.current_revision);
}

function viewFromRow(
  row: {
    id: string;
    project_id: string;
    parent_id: string | null;
    name: string;
    mime: string;
    size_bytes: number;
    content_kind: UploadKind;
  },
  treeVersion: number,
): ProjectNodeView {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    name: row.name,
    kind: "FILE",
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    contentKind: row.content_kind,
    treeVersion,
    deletedAt: null,
  };
}

function handleError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof StorageLimitError) {
    return reply
      .code(413)
      .type("application/problem+json")
      .send(problem(413, "QUOTA_EXCEEDED", requestId));
  }
  if (error instanceof ContentPolicyError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
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

export function registerUploadRoutes(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined; storage?: StorageAdapter | undefined },
): void {
  app.post(
    "/api/v1/projects/:projectId/uploads/presign",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const input = validateRequest(request.body);
        const uploadId = randomUUID();
        const stagingKey = `projects/${auth.projectId}/uploads/${uploadId}`;
        const expiresAt = new Date(Date.now() + signedPutSeconds * 1000);
        const url = await options.storage.presign(stagingKey, "put", signedPutSeconds);
        await options.db.transaction(async (tx) => {
          await ensureTarget(
            tx,
            auth.projectId,
            auth.userId,
            input.parentId ?? null,
            input.fileName,
            input.sizeBytes,
          );
          await tx.query(
            `INSERT INTO pending_uploads
              (id, project_id, actor_id, parent_id, file_name, mime, content_kind,
               expected_size, expected_sha256, staging_key, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              uploadId,
              auth.projectId,
              auth.userId,
              input.parentId ?? null,
              input.fileName,
              input.mime,
              input.contentKind,
              input.sizeBytes,
              input.sha256,
              stagingKey,
              expiresAt,
            ],
          );
        });
        return reply.code(200).send({ uploadId, url, expiresAt: expiresAt.toISOString() });
      } catch (error) {
        return handleError(error, reply, request.id);
      }
    },
  );

  app.post(
    "/api/v1/projects/:projectId/uploads/complete",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const parsed = uploadCompleteSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
        const rawKey = request.headers["idempotency-key"];
        if (typeof rawKey !== "string" || rawKey.length < 16 || rawKey.length > 128)
          throw new AuthError(400, "VALIDATION_ERROR");
        const keyHash = sha256(rawKey);
        const input = parsed.data;
        const pending = await options.db.query<Intent>(
          "SELECT * FROM pending_uploads WHERE id = $1 AND project_id = $2 AND actor_id = $3",
          [input.uploadId, auth.projectId, auth.userId],
        );
        const intent = pending.rows[0];
        if (!intent) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        if (intent.expected_sha256 !== input.sha256)
          throw new AuthError(422, "UNSUPPORTED_CONTENT");
        if (intent.completed_node_id) {
          if (intent.completed_key_hash !== keyHash) throw new AuthError(409, "REVISION_CONFLICT");
          const existing = await options.db.query<{
            id: string;
            project_id: string;
            parent_id: string | null;
            name: string;
            mime: string;
            size_bytes: number;
            content_kind: UploadKind;
            current_revision: number;
          }>(
            `SELECT n.id, n.project_id, n.parent_id, n.name, n.mime, n.size_bytes, n.content_kind,
                    p.current_revision FROM project_nodes n JOIN projects p ON p.id = n.project_id
             WHERE n.id = $1 AND n.project_id = $2`,
            [intent.completed_node_id, auth.projectId],
          );
          if (!existing.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          return reply
            .code(201)
            .send(viewFromRow(existing.rows[0], Number(existing.rows[0].current_revision)));
        }
        if (intent.expires_at.getTime() <= Date.now())
          throw new AuthError(422, "UNSUPPORTED_CONTENT");
        const object = await options.storage.head(intent.staging_key);
        if (!object) throw new AuthError(422, "UNSUPPORTED_CONTENT");
        if (object.sizeBytes > maxFileBytes) throw new AuthError(413, "QUOTA_EXCEEDED");
        if (object.sizeBytes !== Number(intent.expected_size))
          throw new AuthError(422, "UNSUPPORTED_CONTENT");
        const bytes = Buffer.from(
          await options.storage.getLimited(intent.staging_key, maxFileBytes),
        );
        if (
          bytes.length !== Number(intent.expected_size) ||
          sha256(bytes) !== intent.expected_sha256
        )
          throw new AuthError(422, "UNSUPPORTED_CONTENT");
        const text = intent.content_kind === "TEXT" ? verifyTextContent(bytes) : null;
        if (intent.content_kind === "BINARY") verifyBinaryContent(intent.file_name, bytes);
        let blobKey: string | null = null;
        if (intent.content_kind === "BINARY") {
          blobKey = `projects/${auth.projectId}/blobs/${intent.expected_sha256}`;
          const stored = await options.storage.put(blobKey, bytes, intent.mime);
          if (stored.sha256 !== intent.expected_sha256 || stored.sizeBytes !== bytes.length)
            throw new AuthError(503, "SERVICE_UNAVAILABLE");
        }
        const result = await options.db.transaction(async (tx) => {
          const locked = await tx.query<Intent>(
            "SELECT * FROM pending_uploads WHERE id = $1 FOR UPDATE",
            [input.uploadId],
          );
          const current = locked.rows[0];
          if (!current || current.project_id !== auth.projectId || current.actor_id !== auth.userId)
            throw new AuthError(404, "RESOURCE_NOT_FOUND");
          if (current.completed_node_id) {
            if (current.completed_key_hash !== keyHash)
              throw new AuthError(409, "REVISION_CONFLICT");
            const reused = await tx.query<{
              id: string;
              project_id: string;
              parent_id: string | null;
              name: string;
              mime: string;
              size_bytes: number;
              content_kind: UploadKind;
              current_revision: number;
            }>(
              `SELECT n.id, n.project_id, n.parent_id, n.name, n.mime, n.size_bytes, n.content_kind,
                      p.current_revision FROM project_nodes n JOIN projects p ON p.id = n.project_id
               WHERE n.id = $1 AND n.project_id = $2`,
              [current.completed_node_id, auth.projectId],
            );
            if (!reused.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
            return viewFromRow(reused.rows[0], Number(reused.rows[0].current_revision));
          }
          if (current.expires_at.getTime() <= Date.now())
            throw new AuthError(422, "UNSUPPORTED_CONTENT");
          const revision = await ensureTarget(
            tx,
            auth.projectId,
            auth.userId,
            current.parent_id,
            current.file_name,
            Number(current.expected_size),
          );
          const nodeId = randomUUID();
          await tx.query(
            `INSERT INTO project_nodes
              (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
             VALUES ($1, $2, $3, $4, 'FILE', $5, $6, $7, $8)`,
            [
              nodeId,
              auth.projectId,
              current.parent_id,
              current.file_name,
              current.mime,
              current.content_kind,
              bytes.length,
              blobKey,
            ],
          );
          if (text !== null) {
            const doc = new Y.Doc();
            doc.getText("content").insert(0, text);
            const update = Buffer.from(Y.encodeStateAsUpdate(doc));
            doc.destroy();
            await tx.query(
              "INSERT INTO text_documents (file_id, project_id, last_persisted_seq) VALUES ($1, $2, 1)",
              [nodeId, auth.projectId],
            );
            await tx.query(
              `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes, created_at)
               VALUES ($1, $2, 1, $3, $4, NOW())`,
              [randomUUID(), nodeId, auth.userId, update],
            );
          }
          const nextRevision = revision + 1;
          await tx.query(
            "UPDATE projects SET current_revision = $1, updated_at = NOW() WHERE id = $2",
            [nextRevision, auth.projectId],
          );
          await tx.query(
            "UPDATE pending_uploads SET completed_node_id = $1, completed_key_hash = $2 WHERE id = $3",
            [nodeId, keyHash, input.uploadId],
          );
          return viewFromRow(
            {
              id: nodeId,
              project_id: auth.projectId,
              parent_id: current.parent_id,
              name: current.file_name,
              mime: current.mime,
              size_bytes: bytes.length,
              content_kind: current.content_kind,
            },
            nextRevision,
          );
        });
        // The signed PUT can remain valid while another completion is checking
        // this intent. S05-T09 will remove the staging object after expiry.
        return reply.code(201).send(result);
      } catch (error) {
        return handleError(error, reply, request.id);
      }
    },
  );
}
