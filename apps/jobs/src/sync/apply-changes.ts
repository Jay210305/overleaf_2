import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import type { ApplyTextUpdateInput, TextState } from "@latex-collab/contracts";
import {
  RevisionsRepository,
  detachAnchorsForChangedNodes,
  type DatabaseClient,
  type TransactionContext,
} from "@latex-collab/db";
import {
  ContentPolicyError,
  classifyArchivePath,
  maxFileBytes,
  verifyBinaryContent,
  verifyTextContent,
  type ObjectRef,
  type StorageAdapter,
} from "@latex-collab/storage";
import {
  GITHUB_SYNC_PROVIDER,
  GitHubPullError,
  PULL_SNAPSHOT_SOURCE,
  buildAgreement,
  createGitHubPullService,
  fingerprintBinary,
  fingerprintText,
  localFilesFromRevision,
  mapProviderError,
  parseSyncBase,
  type DecryptCredential,
  type GitHubPullInput,
  type GitHubPullReader,
  type LocalFile,
  type PullConflict,
  type PullEntry,
  type RemoteTreeEntry,
  type SyncBaseEntry,
  type SyncBaseManifest,
} from "./github-pull.js";

/**
 * S12-T08 apply step for linked GitHub repositories.
 *
 * The apply composes the S12-T03 pull plan instead of re-planning: unresolved
 * conflicts reject the whole apply (REMOTE_CONFLICT, nothing written) and a
 * synced plan is a no-op. A plan with changes fetches and validates every
 * remote byte through the shared content policy before the first mutation,
 * then applies text through the injected canonical text service (structurally
 * the API's DefaultTextDocumentService, so live canonical state, not a copy,
 * is updated) and binaries through content-addressed object storage.
 *
 * Binary objects are staged before the database transaction. Tree changes,
 * canonical Yjs updates, anchor detachment, revision and agreement commit in
 * that transaction; a failure rolls all database changes back. Invalidation
 * delivery afterwards is best-effort and never rolls back committed state.
 */

export const APPLY_REVISION_LABEL = "Post-pull state";

/** Reject stale, partial or unsupported choices before fetching any remote bytes. */
export function resolvePullPlan(
  entries: PullEntry[],
  conflicts: PullConflict[],
  resolutions: NonNullable<GitHubPullInput["resolutions"]>,
): PullEntry[] {
  const conflictPaths = new Set(conflicts.map((conflict) => conflict.path));
  const chosen = new Map<string, "keep-local" | "keep-remote" | "manual">();
  for (const resolution of resolutions) {
    if (
      !conflictPaths.has(resolution.path) ||
      chosen.has(resolution.path) ||
      !["keep-local", "keep-remote", "manual"].includes(resolution.decision)
    )
      throw new GitHubPullError(400, "VALIDATION_ERROR");
    chosen.set(resolution.path, resolution.decision);
  }
  if (chosen.size !== conflictPaths.size || [...chosen.values()].includes("manual"))
    throw new GitHubPullError(409, "REMOTE_CONFLICT");
  return entries.map((entry) => {
    if (entry.action !== "conflict") return entry;
    const decision = chosen.get(entry.path);
    if (decision === "keep-local")
      return { ...entry, action: entry.localKind === null ? "keep-deleted" : "keep-local" };
    if (decision !== "keep-remote") throw new GitHubPullError(409, "REMOTE_CONFLICT");
    if (entry.remoteKind === "folder") throw new GitHubPullError(422, "UNSUPPORTED_CONTENT");
    return {
      ...entry,
      action: entry.remoteKind === null ? "delete" : entry.localKind === null ? "add" : "update",
    };
  });
}

/** Provider port widened for the apply step: fetch exact bytes by blob SHA. */
export interface GitHubApplyReader extends GitHubPullReader {
  readFile(
    token: string,
    remoteRef: string,
    branch: string,
    path: string,
    sha: string,
  ): Promise<Uint8Array>;
}

/**
 * Canonical text port. Structurally satisfied by the API text document
 * service; injected so jobs code and tests exercise the real canonical
 * implementation without importing apps/api.
 */
export interface CanonicalTextPort {
  load(
    projectId: string,
    fileId: string,
    actorId: string,
    tx?: TransactionContext,
  ): Promise<TextState>;
  apply(
    projectId: string,
    fileId: string,
    actorId: string,
    input: ApplyTextUpdateInput,
    tx?: TransactionContext,
  ): Promise<TextState>;
}

/**
 * Live-content invalidation event. `file_changed` carries the bounded Yjs
 * delta published on the room update channel (`collab:room:<roomId>:updates`,
 * applied and forwarded by connected replicas); `updateBase64` is null for
 * binary or tree-only changes where clients refresh metadata instead.
 * `file_deleted` maps to the collab tree synchronizer's `file.deleted`
 * room-close semantics.
 */
export interface SyncInvalidationEvent {
  type: "file_changed" | "file_deleted";
  projectId: string;
  fileId: string;
  updateBase64: string | null;
}

export interface SyncInvalidationPublisher {
  publish(event: SyncInvalidationEvent): Promise<void>;
}

export interface GitHubApplyServiceOptions {
  db: DatabaseClient;
  reader: GitHubApplyReader;
  decryptCredential: DecryptCredential;
  storage: StorageAdapter;
  canonicalText: CanonicalTextPort;
  invalidations: SyncInvalidationPublisher;
}

export interface GitHubApplyResult {
  status: "synced" | "applied";
  remoteRef: string;
  branch: string;
  remoteSha: string;
  entries: PullEntry[];
  appliedPaths: string[];
  conflicts: PullConflict[];
  preRevisionId: string;
  preRevisionNo: number;
  revisionId: string;
  revisionNo: number;
  detachedAnchorIds: string[];
  conflictedSuggestionIds: string[];
  invalidationsEmitted: number;
  invalidationsFailed: number;
}

export interface FrozenLocal {
  exists: boolean;
  kind: "text" | "binary" | "folder" | null;
  fingerprint: string | null;
}

/**
 * Guards one frozen plan entry against live local state. Adds require the path
 * to still be absent; update/delete require the exact frozen kind and
 * fingerprint. Any divergence is a concurrent local change: REVISION_CONFLICT.
 * Earlier entries in the same transaction are rolled back on divergence.
 */
export function verifyFrozenLocal(entry: PullEntry, live: FrozenLocal): void {
  if (entry.action === "add") {
    if (live.exists) throw new GitHubPullError(409, "REVISION_CONFLICT");
    return;
  }
  if (entry.action !== "update" && entry.action !== "delete") return;
  if (
    !live.exists ||
    live.kind !== entry.localKind ||
    live.fingerprint !== entry.localFingerprint
  ) {
    throw new GitHubPullError(409, "REVISION_CONFLICT");
  }
}

/**
 * Bounded replacement delta that converges a canonical text document to
 * `nextText` while preserving its edit history. Returns null when the document
 * already matches. Malformed canonical state is REVISION_CONFLICT rather than
 * a fabricated delta.
 */
export function buildReplacementUpdate(
  currentUpdateBase64: string,
  nextText: string,
): ApplyTextUpdateInput | null {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Buffer.from(currentUpdateBase64, "base64"));
    const text = doc.getText("content");
    if (text.toString() === nextText) return null;
    const baseStateVector = Y.encodeStateVector(doc);
    text.delete(0, text.length);
    text.insert(0, nextText);
    const update = Y.encodeStateAsUpdate(doc, baseStateVector);
    return {
      updateBase64: Buffer.from(update).toString("base64"),
      baseStateVectorBase64: Buffer.from(baseStateVector).toString("base64"),
    };
  } catch (error) {
    if (error instanceof GitHubPullError) throw error;
    throw new GitHubPullError(409, "REVISION_CONFLICT");
  } finally {
    doc.destroy();
  }
}

interface LiveNode {
  id: string;
  parentId: string | null;
  name: string;
  kind: "FILE" | "FOLDER";
  contentKind: "TEXT" | "BINARY";
  sizeBytes: number;
  blobKey: string | null;
}

type PreparedFile =
  | { entry: PullEntry; kind: "text"; mime: string; bytes: Uint8Array; text: string }
  | { entry: PullEntry; kind: "binary"; mime: string; bytes: Uint8Array; blobKey: string };

interface PendingInvalidation {
  type: "file_changed" | "file_deleted";
  fileId: string;
  updateBase64: string | null;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function blobKeyFor(projectId: string, bytes: Uint8Array): string {
  return `projects/${projectId}/blobs/${sha256Hex(bytes)}`;
}

function decodeCanonicalText(updateBase64: string): string {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Buffer.from(updateBase64, "base64"));
    return doc.getText("content").toString();
  } catch {
    throw new GitHubPullError(409, "REVISION_CONFLICT");
  } finally {
    doc.destroy();
  }
}

function indexLiveNodes(rows: LiveNode[]): Map<string, LiveNode> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byPath = new Map<string, LiveNode>();
  for (const row of rows) {
    const segments = [row.name];
    let parentId = row.parentId;
    for (let guard = 0; parentId !== null && guard < 128; guard += 1) {
      const parent = byId.get(parentId);
      if (!parent) break;
      segments.unshift(parent.name);
      parentId = parent.parentId;
    }
    byPath.set(segments.join("/"), row);
  }
  return byPath;
}

function assertAddAncestors(path: string, liveByPath: Map<string, LiveNode>): void {
  const segments = path.split("/");
  let prefix = "";
  for (let index = 0; index < segments.length - 1; index += 1) {
    prefix = prefix === "" ? segments[index]! : `${prefix}/${segments[index]!}`;
    const ancestor = liveByPath.get(prefix);
    if (ancestor && ancestor.kind !== "FOLDER") throw new GitHubPullError(409, "REVISION_CONFLICT");
  }
}

function mapContentPolicyError(error: unknown): GitHubPullError {
  if (error instanceof GitHubPullError) return error;
  if (error instanceof ContentPolicyError) return new GitHubPullError(error.status, error.code);
  return new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
}

function mapCanonicalError(error: unknown): GitHubPullError {
  if (error instanceof GitHubPullError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const status = (error as { status?: unknown } | null)?.status;
  if (code === "REVISION_CONFLICT" || status === 409)
    return new GitHubPullError(409, "REVISION_CONFLICT");
  if (code === "QUOTA_EXCEEDED" || status === 413)
    return new GitHubPullError(413, "QUOTA_EXCEEDED");
  if (code === "UNSUPPORTED_CONTENT" || status === 422)
    return new GitHubPullError(422, "UNSUPPORTED_CONTENT");
  if (code === "VALIDATION_ERROR" || status === 400)
    return new GitHubPullError(400, "VALIDATION_ERROR");
  // The file or membership vanished mid-apply: the frozen plan no longer
  // matches live canonical state.
  if (status === 404 || status === 403) return new GitHubPullError(409, "REVISION_CONFLICT");
  return new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
}

function mergeAgreement(
  postFiles: LocalFile[],
  accepted: RemoteTreeEntry[],
  remoteSha: string,
  entries: PullEntry[],
  preBase: SyncBaseManifest | null,
): SyncBaseManifest {
  const agreement = buildAgreement(postFiles, accepted, remoteSha);
  const byPath = new Map<string, SyncBaseEntry>(
    agreement.entries.map((entry) => [entry.path, entry]),
  );
  const baseByPath = new Map<string, SyncBaseEntry>(
    (preBase?.entries ?? []).map((entry) => [entry.path, entry]),
  );
  // Paths already resolved as "keep deleted" must not be resurrected by the
  // rebuilt agreement while the remote side stays unchanged.
  for (const entry of entries) {
    if (entry.action !== "keep-deleted") continue;
    const kept = baseByPath.get(entry.path);
    if (kept) byPath.set(entry.path, { ...kept, remoteSha: entry.remoteSha });
  }
  const merged = [...byPath.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  return { version: 1, remoteSha, entries: merged };
}

export function createGitHubApplyService(options: GitHubApplyServiceOptions) {
  const { db, reader, decryptCredential, storage, canonicalText, invalidations } = options;
  const revisions = new RevisionsRepository(db);
  const pullService = createGitHubPullService({ db, reader, decryptCredential });

  async function apply(input: GitHubPullInput): Promise<GitHubApplyResult> {
    const plan = await pullService.pull(input);
    const resolvedEntries = resolvePullPlan(plan.entries, plan.conflicts, input.resolutions ?? []);

    const result: GitHubApplyResult = {
      status: plan.status === "synced" ? "synced" : "applied",
      remoteRef: plan.remoteRef,
      branch: plan.branch,
      remoteSha: plan.remoteSha,
      entries: resolvedEntries,
      appliedPaths: [],
      conflicts: plan.conflicts,
      preRevisionId: plan.localRevisionId,
      preRevisionNo: plan.localRevisionNo,
      revisionId: plan.localRevisionId,
      revisionNo: plan.localRevisionNo,
      detachedAnchorIds: [],
      conflictedSuggestionIds: [],
      invalidationsEmitted: 0,
      invalidationsFailed: 0,
    };

    if (plan.status === "synced") return result;

    const projectId = input.projectId;
    const actorId = input.actorUserId;

    const integration = await db.query<{
      id: string;
      connection_id: string;
      sync_base_manifest: unknown;
    }>(
      `SELECT id, connection_id, sync_base_manifest
       FROM project_integrations
       WHERE project_id = $1 AND provider = $2 AND remote_ref = $3`,
      [projectId, GITHUB_SYNC_PROVIDER, input.remoteRef],
    );
    const integrationRow = integration.rows[0];
    if (!integrationRow) throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
    const integrationId = integrationRow.id;
    let preBase = parseSyncBase(integrationRow.sync_base_manifest);

    const connection = await db.query<{ encrypted_credential_ref: string; status: string }>(
      "SELECT encrypted_credential_ref, status FROM external_connections WHERE id = $1",
      [integrationRow.connection_id],
    );
    const connectionRow = connection.rows[0];
    if (!connectionRow || connectionRow.status !== "active")
      throw new GitHubPullError(401, "CREDENTIALS_MISSING");
    let token: string;
    try {
      token = await decryptCredential(connectionRow.encrypted_credential_ref);
    } catch {
      throw new GitHubPullError(401, "CREDENTIALS_MISSING");
    }
    if (typeof token !== "string" || token.length === 0)
      throw new GitHubPullError(401, "CREDENTIALS_MISSING");

    const projectRow = (
      await db.query<{ main_file_id: string | null }>(
        "SELECT main_file_id FROM projects WHERE id = $1",
        [projectId],
      )
    ).rows[0];
    if (!projectRow) throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
    let projectMainFileId = projectRow.main_file_id;

    const nodeRows = await db.query<{
      id: string;
      parent_id: string | null;
      name: string;
      kind: string;
      content_kind: string;
      size_bytes: string;
      blob_key: string | null;
    }>(
      `SELECT id, parent_id, name, kind, content_kind, size_bytes, blob_key
       FROM project_nodes
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId],
    );
    let liveByPath = indexLiveNodes(
      nodeRows.rows.map((row) => ({
        id: row.id,
        parentId: row.parent_id,
        name: row.name,
        kind: row.kind === "FOLDER" ? "FOLDER" : "FILE",
        contentKind: row.content_kind === "BINARY" ? "BINARY" : "TEXT",
        sizeBytes: Number(row.size_bytes),
        blobKey: row.blob_key,
      })),
    );

    const actionable = resolvedEntries.filter(
      (entry) => entry.action === "add" || entry.action === "update" || entry.action === "delete",
    );

    // Phase 1: fetch and validate every remote byte before the first mutation,
    // so a provider or content-policy failure cannot leave a half-applied tree.
    const preparedByEntry = new Map<PullEntry, PreparedFile>();
    for (const entry of actionable) {
      if (entry.action === "delete") continue;
      if (entry.remoteSha === null) throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
      if (entry.action === "add") assertAddAncestors(entry.path, liveByPath);
      let bytes: Uint8Array;
      try {
        bytes = await reader.readFile(
          token,
          input.remoteRef,
          plan.branch,
          entry.path,
          entry.remoteSha,
        );
      } catch (error) {
        throw mapProviderError(error);
      }
      if (!(bytes instanceof Uint8Array)) throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
      if (bytes.byteLength > maxFileBytes) throw new GitHubPullError(413, "QUOTA_EXCEEDED");
      let prepared: PreparedFile;
      try {
        const policy = classifyArchivePath(entry.path);
        if (policy.kind === "TEXT") {
          prepared = {
            entry,
            kind: "text",
            mime: policy.mime,
            bytes,
            text: verifyTextContent(bytes),
          };
        } else {
          verifyBinaryContent(entry.path, bytes);
          prepared = {
            entry,
            kind: "binary",
            mime: policy.mime,
            bytes,
            blobKey: blobKeyFor(projectId, bytes),
          };
        }
      } catch (error) {
        throw mapContentPolicyError(error);
      }
      preparedByEntry.set(entry, prepared);
      if (prepared.kind === "binary") {
        let ref: ObjectRef;
        try {
          ref = await storage.put(prepared.blobKey, prepared.bytes, prepared.mime);
        } catch {
          throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
        }
        if (ref.sha256 !== sha256Hex(prepared.bytes) || ref.sizeBytes !== prepared.bytes.byteLength)
          throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
      }
    }

    const pending: PendingInvalidation[] = [];
    const changedNodeIds: string[] = [];

    const final = await db.transaction(async (tx) => {
      const locked = await tx.query<{ sync_cursor: string | null; sync_base_manifest: unknown }>(
        "SELECT sync_cursor, sync_base_manifest FROM project_integrations WHERE id = $1 FOR UPDATE",
        [integrationId],
      );
      if (
        !locked.rows[0] ||
        (locked.rows[0].sync_cursor && locked.rows[0].sync_cursor !== plan.remoteSha)
      )
        throw new GitHubPullError(409, "REMOTE_CONFLICT");
      if (
        JSON.stringify(locked.rows[0].sync_base_manifest) !==
        JSON.stringify(integrationRow.sync_base_manifest)
      )
        throw new GitHubPullError(409, "REVISION_CONFLICT");
      preBase = parseSyncBase(locked.rows[0].sync_base_manifest);
      const lockedProject = await tx.query<{
        main_file_id: string | null;
        owner_id: string;
        status: string;
      }>("SELECT main_file_id, owner_id, status FROM projects WHERE id = $1 FOR UPDATE", [
        projectId,
      ]);
      if (!lockedProject.rows[0] || lockedProject.rows[0].status === "trashed")
        throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
      if (lockedProject.rows[0].owner_id !== actorId) {
        const member = await tx.query<{ role: string }>(
          "SELECT role FROM active_project_members WHERE project_id = $1 AND user_id = $2",
          [projectId, actorId],
        );
        if (member.rows[0]?.role !== "OWNER" && member.rows[0]?.role !== "EDITOR")
          throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
      }
      projectMainFileId = lockedProject.rows[0].main_file_id;
      const freshNodes = await tx.query<{
        id: string;
        parent_id: string | null;
        name: string;
        kind: string;
        content_kind: string;
        size_bytes: string;
        blob_key: string | null;
      }>(
        `SELECT id, parent_id, name, kind, content_kind, size_bytes, blob_key
         FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL`,
        [projectId],
      );
      liveByPath = indexLiveNodes(
        freshNodes.rows.map((row) => ({
          id: row.id,
          parentId: row.parent_id,
          name: row.name,
          kind: row.kind === "FOLDER" ? "FOLDER" : "FILE",
          contentKind: row.content_kind === "BINARY" ? "BINARY" : "TEXT",
          sizeBytes: Number(row.size_bytes),
          blobKey: row.blob_key,
        })),
      );

      async function applyAdd(entry: PullEntry, file: PreparedFile): Promise<void> {
        const existing = liveByPath.get(entry.path);
        verifyFrozenLocal(entry, {
          exists: existing !== undefined,
          kind: existing
            ? existing.kind === "FOLDER"
              ? "folder"
              : existing.contentKind === "TEXT"
                ? "text"
                : "binary"
            : null,
          fingerprint: null,
        });

        const segments = entry.path.split("/");
        const name = segments.at(-1)!;
        const nodeId = randomUUID();
        let parentId: string | null = null;
        try {
          let prefix = "";
          for (let index = 0; index < segments.length - 1; index += 1) {
            const segment = segments[index]!;
            prefix = prefix === "" ? segment : `${prefix}/${segment}`;
            const current = liveByPath.get(prefix);
            if (current) {
              if (current.kind !== "FOLDER") throw new GitHubPullError(409, "REVISION_CONFLICT");
              parentId = current.id;
              continue;
            }
            const folderId = randomUUID();
            await tx.query(
              `INSERT INTO project_nodes
                 (id, project_id, parent_id, name, kind, mime, size_bytes, content_kind)
               VALUES ($1, $2, $3, $4, 'FOLDER', 'application/x-directory', 0, 'TEXT')`,
              [folderId, projectId, parentId, segment],
            );
            liveByPath.set(prefix, {
              id: folderId,
              parentId,
              name: segment,
              kind: "FOLDER",
              contentKind: "TEXT",
              sizeBytes: 0,
              blobKey: null,
            });
            parentId = folderId;
          }
          await tx.query(
            `INSERT INTO project_nodes
               (id, project_id, parent_id, name, kind, mime, size_bytes, content_kind, blob_key)
             VALUES ($1, $2, $3, $4, 'FILE', $5, $6, $7, $8)`,
            [
              nodeId,
              projectId,
              parentId,
              name,
              file.mime,
              file.bytes.byteLength,
              file.kind === "text" ? "TEXT" : "BINARY",
              file.kind === "binary" ? file.blobKey : null,
            ],
          );
        } catch (error) {
          if (error instanceof GitHubPullError) throw error;
          const code = (error as { code?: unknown } | null)?.code;
          // Active-sibling unique index: the path appeared between planning and
          // applying.
          if (code === "23505" || code === "CONSTRAINT_VIOLATION")
            throw new GitHubPullError(409, "REVISION_CONFLICT");
          throw error;
        }

        liveByPath.set(entry.path, {
          id: nodeId,
          parentId,
          name,
          kind: "FILE",
          contentKind: file.kind === "text" ? "TEXT" : "BINARY",
          sizeBytes: file.bytes.byteLength,
          blobKey: file.kind === "binary" ? file.blobKey : null,
        });
        if (file.kind === "binary") {
          pending.push({ type: "file_changed", fileId: nodeId, updateBase64: null });
          return;
        }

        let state: TextState;
        try {
          state = await canonicalText.load(projectId, nodeId, actorId, tx);
        } catch (error) {
          throw mapCanonicalError(error);
        }
        if (decodeCanonicalText(state.updateBase64) !== "")
          throw new GitHubPullError(409, "REVISION_CONFLICT");
        const replacement = buildReplacementUpdate(state.updateBase64, file.text);
        if (replacement) {
          try {
            await canonicalText.apply(projectId, nodeId, actorId, replacement, tx);
          } catch (error) {
            throw mapCanonicalError(error);
          }
        }
        pending.push({
          type: "file_changed",
          fileId: nodeId,
          updateBase64: replacement?.updateBase64 ?? null,
        });
      }

      async function applyUpdate(entry: PullEntry, file: PreparedFile): Promise<void> {
        const live = liveByPath.get(entry.path);
        if (!live) throw new GitHubPullError(409, "REVISION_CONFLICT");

        if (file.kind === "binary") {
          const fresh = (
            await tx.query<{
              blob_key: string | null;
              size_bytes: string;
              deleted_at: Date | null;
            }>("SELECT blob_key, size_bytes, deleted_at FROM project_nodes WHERE id = $1", [
              live.id,
            ])
          ).rows[0];
          if (!fresh || fresh.deleted_at !== null)
            throw new GitHubPullError(409, "REVISION_CONFLICT");
          verifyFrozenLocal(entry, {
            exists: true,
            kind: "binary",
            fingerprint: fresh.blob_key ? fingerprintBinary(fresh.blob_key) : null,
          });

          await tx.query("UPDATE project_nodes SET blob_key = $2, size_bytes = $3 WHERE id = $1", [
            live.id,
            file.blobKey,
            file.bytes.byteLength,
          ]);
          liveByPath.set(entry.path, {
            ...live,
            blobKey: file.blobKey,
            sizeBytes: file.bytes.byteLength,
          });
          changedNodeIds.push(live.id);
          pending.push({ type: "file_changed", fileId: live.id, updateBase64: null });
          return;
        }

        let state: TextState;
        try {
          state = await canonicalText.load(projectId, live.id, actorId, tx);
        } catch (error) {
          throw mapCanonicalError(error);
        }
        const currentText = decodeCanonicalText(state.updateBase64);
        verifyFrozenLocal(entry, {
          exists: true,
          kind: "text",
          fingerprint: fingerprintText(currentText),
        });
        const replacement = buildReplacementUpdate(state.updateBase64, file.text);
        if (!replacement) return;
        try {
          await canonicalText.apply(projectId, live.id, actorId, replacement, tx);
        } catch (error) {
          throw mapCanonicalError(error);
        }
        await tx.query("UPDATE project_nodes SET size_bytes = $2 WHERE id = $1", [
          live.id,
          file.bytes.byteLength,
        ]);
        liveByPath.set(entry.path, { ...live, sizeBytes: file.bytes.byteLength });
        changedNodeIds.push(live.id);
        pending.push({
          type: "file_changed",
          fileId: live.id,
          updateBase64: replacement.updateBase64,
        });
      }

      async function applyDelete(entry: PullEntry): Promise<void> {
        const live = liveByPath.get(entry.path);
        if (!live) throw new GitHubPullError(409, "REVISION_CONFLICT");

        if (entry.localKind === "text") {
          let state: TextState;
          try {
            state = await canonicalText.load(projectId, live.id, actorId, tx);
          } catch (error) {
            throw mapCanonicalError(error);
          }
          verifyFrozenLocal(entry, {
            exists: true,
            kind: "text",
            fingerprint: fingerprintText(decodeCanonicalText(state.updateBase64)),
          });
        } else {
          const fresh = (
            await tx.query<{ blob_key: string | null; deleted_at: Date | null }>(
              "SELECT blob_key, deleted_at FROM project_nodes WHERE id = $1",
              [live.id],
            )
          ).rows[0];
          if (!fresh || fresh.deleted_at !== null)
            throw new GitHubPullError(409, "REVISION_CONFLICT");
          verifyFrozenLocal(entry, {
            exists: true,
            kind: "binary",
            fingerprint: fresh.blob_key ? fingerprintBinary(fresh.blob_key) : null,
          });
        }

        await tx.query(
          "UPDATE project_nodes SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
          [live.id],
        );
        const wasMain = projectMainFileId === live.id;
        if (wasMain) {
          await tx.query(
            "UPDATE projects SET main_file_id = NULL WHERE id = $1 AND main_file_id = $2",
            [projectId, live.id],
          );
        }
        changedNodeIds.push(live.id);
        pending.push({ type: "file_deleted", fileId: live.id, updateBase64: null });
      }

      // All canonical text, tree, revision and agreement writes share one transaction.
      for (const entry of actionable) {
        if (entry.action === "add") {
          const file = preparedByEntry.get(entry);
          if (!file) throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
          await applyAdd(entry, file);
        } else if (entry.action === "update") {
          const file = preparedByEntry.get(entry);
          if (!file) throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
          await applyUpdate(entry, file);
        } else {
          await applyDelete(entry);
        }
        result.appliedPaths.push(entry.path);
      }

      const accepted: RemoteTreeEntry[] = [];
      for (const entry of resolvedEntries) {
        if (entry.remoteKind === "file" && entry.remoteSha !== null) {
          accepted.push({
            path: entry.path,
            kind: "file",
            sizeBytes: entry.sizeBytes ?? 0,
            sha: entry.remoteSha,
          });
        }
      }

      // Anchor detachment, post-apply revision and recorded agreement commit
      // with the file mutations above.
      const detachment = await detachAnchorsForChangedNodes(tx, projectId, changedNodeIds);
      const revision = await revisions.createStructuralRevision(
        {
          projectId,
          authorId: actorId,
          source: PULL_SNAPSHOT_SOURCE,
          label: APPLY_REVISION_LABEL,
        },
        tx,
      );
      const postFiles = await localFilesFromRevision(tx, revision.id);
      const agreement = mergeAgreement(
        postFiles,
        accepted,
        plan.remoteSha,
        resolvedEntries,
        preBase,
      );
      const updated = await tx.query(
        `UPDATE project_integrations
           SET sync_base_manifest = $2::jsonb, sync_cursor = $3, last_synced_revision = $4
           WHERE id = $1`,
        [integrationId, JSON.stringify(agreement), plan.remoteSha, String(revision.revisionNo)],
      );
      if (updated.rowCount === 0) throw new GitHubPullError(409, "REVISION_CONFLICT");
      return { revision, detachment };
    });

    result.revisionId = final.revision.id;
    result.revisionNo = final.revision.revisionNo;
    result.detachedAnchorIds = final.detachment.detachedCommentIds;
    result.conflictedSuggestionIds = final.detachment.conflictedSuggestionIds;

    // Best-effort live invalidation delivery; committed state never rolls back.
    for (const item of pending) {
      try {
        await invalidations.publish({
          type: item.type,
          projectId,
          fileId: item.fileId,
          updateBase64: item.updateBase64,
        });
        result.invalidationsEmitted += 1;
      } catch {
        result.invalidationsFailed += 1;
        console.warn("github-pull apply: invalidation delivery failed");
      }
    }

    return result;
  }

  return { apply };
}
