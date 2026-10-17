import { createHash, randomUUID } from "node:crypto";
import {
  canonicalJsonStringify,
  isUUID,
  type DatabaseClient,
  type RevisionManifest,
} from "@latex-collab/db";
import {
  maxFileBytes,
  maxProjectBytes,
  maxProjectNodes,
  type StorageAdapter,
} from "@latex-collab/storage";
import {
  GITHUB_SYNC_PROVIDER,
  GitHubPullError,
  buildAgreement,
  localFilesFromRevision,
  mapProviderError,
  parseSyncBase,
  type DecryptCredential,
  type RemoteTreeEntry,
} from "./github-pull.js";

const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = /^[A-Za-z0-9._/-]+$/;

export interface GitHubPushInput {
  actorUserId: string;
  projectId: string;
  remoteRef: string;
  sourceRevisionId: string;
  expectedRemoteSha: string;
  branch?: string;
}

export interface GitHubPushWriter {
  readHead(
    token: string,
    remoteRef: string,
    branch: string,
  ): Promise<{ sha: string; treeSha: string }>;
  writeBlob(token: string, remoteRef: string, bytes: Uint8Array): Promise<string>;
  writeTree(
    token: string,
    remoteRef: string,
    baseTreeSha: string,
    entries: Array<{ path: string; sha: string | null }>,
  ): Promise<string>;
  writeCommit(
    token: string,
    remoteRef: string,
    treeSha: string,
    parentSha: string,
    message: string,
  ): Promise<string>;
  updateBranch(token: string, remoteRef: string, branch: string, commitSha: string): Promise<void>;
}

export interface GitHubPushResult {
  status: "synced";
  remoteSha: string;
  sourceRevisionId: string;
  sourceManifestHash: string;
  branch: string;
  pushedPaths: string[];
}

/** GitHub Git database API adapter. All URLs stay on api.github.com. */
export function createGitHubRestPushWriter(request: typeof fetch = fetch): GitHubPushWriter {
  async function call(
    token: string,
    remoteRef: string,
    path: string,
    method = "GET",
    body?: unknown,
    refUpdate = false,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await request(`https://api.github.com/repos/${remoteRef}/git/${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw { code: "PROVIDER_UNAVAILABLE" };
    }
    if (!response.ok) {
      if (response.status === 401) throw { code: "TOKEN_EXPIRED" };
      if (
        response.status === 429 ||
        (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
      )
        throw { code: "RATE_LIMITED" };
      if (response.status === 403) throw { code: "CREDENTIALS_MISSING" };
      if (response.status === 404) throw { code: "RESOURCE_NOT_FOUND" };
      if (refUpdate && (response.status === 409 || response.status === 422))
        throw { code: "REMOTE_CONFLICT" };
      throw { code: "PROVIDER_UNAVAILABLE" };
    }
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw { code: "PROVIDER_UNAVAILABLE" };
    }
  }
  function sha(value: unknown): string {
    if (typeof value !== "string" || !SHA.test(value)) throw { code: "PROVIDER_UNAVAILABLE" };
    return value;
  }
  const refPath = (branch: string) =>
    `refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`;
  return {
    async readHead(token, remoteRef, branch) {
      const ref = await call(
        token,
        remoteRef,
        `ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
      );
      const commitSha = sha((ref.object as Record<string, unknown> | undefined)?.sha);
      const commit = await call(token, remoteRef, `commits/${commitSha}`);
      return {
        sha: commitSha,
        treeSha: sha((commit.tree as Record<string, unknown> | undefined)?.sha),
      };
    },
    async writeBlob(token, remoteRef, bytes) {
      const blob = await call(token, remoteRef, "blobs", "POST", {
        content: Buffer.from(bytes).toString("base64"),
        encoding: "base64",
      });
      return sha(blob.sha);
    },
    async writeTree(token, remoteRef, baseTreeSha, entries) {
      const tree = await call(token, remoteRef, "trees", "POST", {
        base_tree: baseTreeSha,
        tree: entries.map((entry) => ({
          path: entry.path,
          mode: "100644",
          type: "blob",
          sha: entry.sha,
        })),
      });
      return sha(tree.sha);
    },
    async writeCommit(token, remoteRef, treeSha, parentSha, message) {
      const commit = await call(token, remoteRef, "commits", "POST", {
        message,
        tree: treeSha,
        parents: [parentSha],
      });
      return sha(commit.sha);
    },
    async updateBranch(token, remoteRef, branch, commitSha) {
      const updated = await call(
        token,
        remoteRef,
        refPath(branch),
        "PATCH",
        {
          sha: commitSha,
          force: false,
        },
        true,
      );
      if (sha((updated.object as Record<string, unknown> | undefined)?.sha) !== commitSha)
        throw { code: "PROVIDER_UNAVAILABLE" };
    },
  };
}

export function createGitHubPushService(options: {
  db: DatabaseClient;
  writer: GitHubPushWriter;
  storage: StorageAdapter;
  decryptCredential: DecryptCredential;
}) {
  const { db, writer, storage, decryptCredential } = options;

  async function push(input: GitHubPushInput): Promise<GitHubPushResult> {
    if (
      !isUUID(input.actorUserId) ||
      !isUUID(input.projectId) ||
      !isUUID(input.sourceRevisionId) ||
      !REPO.test(input.remoteRef) ||
      !SHA.test(input.expectedRemoteSha)
    )
      throw new GitHubPullError(400, "VALIDATION_ERROR");

    const project = (
      await db.query<{ owner_id: string; status: string }>(
        "SELECT owner_id, status FROM projects WHERE id = $1",
        [input.projectId],
      )
    ).rows[0];
    if (!project || project.status === "trashed")
      throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
    if (project.owner_id !== input.actorUserId) {
      const member = (
        await db.query<{ role: string }>(
          "SELECT role FROM active_project_members WHERE project_id = $1 AND user_id = $2",
          [input.projectId, input.actorUserId],
        )
      ).rows[0];
      if (member?.role !== "OWNER" && member?.role !== "EDITOR")
        throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
    }

    const link = (
      await db.query<{
        id: string;
        connection_id: string;
        branch: string | null;
        sync_cursor: string | null;
        sync_base_manifest: unknown;
      }>(
        `SELECT id, connection_id, branch, sync_cursor, sync_base_manifest FROM project_integrations
       WHERE project_id = $1 AND provider = $2 AND remote_ref = $3`,
        [input.projectId, GITHUB_SYNC_PROVIDER, input.remoteRef],
      )
    ).rows[0];
    if (!link) throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
    const branch = input.branch ?? link.branch;
    if (
      !branch ||
      !BRANCH.test(branch) ||
      branch.includes("..") ||
      branch.includes("//") ||
      (link.branch !== null && branch !== link.branch)
    )
      throw new GitHubPullError(400, "VALIDATION_ERROR");
    if (link.sync_cursor !== input.expectedRemoteSha)
      throw new GitHubPullError(409, "REMOTE_CONFLICT");
    const base = parseSyncBase(link.sync_base_manifest);
    if (base && base.remoteSha !== input.expectedRemoteSha)
      throw new GitHubPullError(409, "REVISION_CONFLICT");

    const connection = (
      await db.query<{ encrypted_credential_ref: string; status: string }>(
        "SELECT encrypted_credential_ref, status FROM external_connections WHERE id = $1",
        [link.connection_id],
      )
    ).rows[0];
    if (!connection || connection.status !== "active")
      throw new GitHubPullError(401, "CREDENTIALS_MISSING");
    let token: string;
    try {
      token = decryptCredential(connection.encrypted_credential_ref);
    } catch {
      throw new GitHubPullError(401, "CREDENTIALS_MISSING");
    }
    if (!token) throw new GitHubPullError(401, "CREDENTIALS_MISSING");

    const revision = (
      await db.query<{
        revision_no: string;
        manifest_hash: string;
        manifest_json: unknown;
      }>(
        `SELECT revision_no, manifest_hash, manifest_json FROM project_revisions
       WHERE id = $1 AND project_id = $2`,
        [input.sourceRevisionId, input.projectId],
      )
    ).rows[0];
    if (!revision || !revision.manifest_json) throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
    const manifestHash = createHash("sha256")
      .update(canonicalJsonStringify(revision.manifest_json))
      .digest("hex");
    if (manifestHash !== revision.manifest_hash)
      throw new GitHubPullError(409, "REVISION_CONFLICT");
    const manifest = revision.manifest_json as RevisionManifest;
    if (
      manifest.version !== 1 ||
      manifest.projectId !== input.projectId ||
      manifest.revisionId !== input.sourceRevisionId ||
      manifest.revisionNo !== Number(revision.revision_no) ||
      !Array.isArray(manifest.items)
    )
      throw new GitHubPullError(409, "REVISION_CONFLICT");

    const items = (
      await db.query<{
        path: string;
        blob_key: string;
        sha256: string;
        content_kind: string | null;
        size_bytes: string | null;
        text_bytes: Buffer | null;
      }>(
        `SELECT path, blob_key, sha256, content_kind, size_bytes, text_bytes
       FROM revision_items WHERE revision_id = $1 AND deleted = false ORDER BY path ASC`,
        [input.sourceRevisionId],
      )
    ).rows;
    if (items.length > maxProjectNodes) throw new GitHubPullError(413, "QUOTA_EXCEEDED");
    const manifestByPath = new Map(manifest.items.map((item) => [item.path, item]));
    if (manifestByPath.size !== items.length) throw new GitHubPullError(409, "REVISION_CONFLICT");
    const frozen = [] as Array<{ path: string; bytes: Buffer }>;
    let totalBytes = 0;
    for (const item of items) {
      const expected = manifestByPath.get(item.path);
      if (
        !expected ||
        expected.kind !== item.content_kind ||
        expected.object.key !== item.blob_key ||
        expected.object.sha256 !== item.sha256 ||
        expected.object.sizeBytes !== Number(item.size_bytes)
      )
        throw new GitHubPullError(409, "REVISION_CONFLICT");
      let bytes: Buffer;
      if (item.content_kind === "TEXT" && item.text_bytes !== null) {
        bytes = item.text_bytes;
      } else if (
        item.content_kind === "BINARY" &&
        item.blob_key === `projects/${input.projectId}/blobs/${item.sha256}`
      ) {
        try {
          bytes = Buffer.from(await storage.getLimited(item.blob_key, maxFileBytes));
        } catch {
          throw new GitHubPullError(409, "REVISION_CONFLICT");
        }
      } else {
        throw new GitHubPullError(409, "REVISION_CONFLICT");
      }
      if (
        bytes.length !== Number(item.size_bytes) ||
        createHash("sha256").update(bytes).digest("hex") !== item.sha256
      )
        throw new GitHubPullError(409, "REVISION_CONFLICT");
      totalBytes += bytes.length;
      if (bytes.length > maxFileBytes || totalBytes > maxProjectBytes)
        throw new GitHubPullError(413, "QUOTA_EXCEEDED");
      frozen.push({ path: item.path, bytes });
    }

    let head: { sha: string; treeSha: string };
    try {
      head = await writer.readHead(token, input.remoteRef, branch);
    } catch (error) {
      throw mapProviderError(error);
    }
    if (!SHA.test(head.sha) || !SHA.test(head.treeSha))
      throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
    if (head.sha !== input.expectedRemoteSha) throw new GitHubPullError(409, "REMOTE_CONFLICT");

    let commitSha: string;
    const entries: Array<{ path: string; sha: string | null }> = [];
    try {
      for (const file of frozen) {
        const sha = await writer.writeBlob(token, input.remoteRef, file.bytes);
        if (!SHA.test(sha)) throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
        entries.push({ path: file.path, sha });
      }
      const localPaths = new Set(frozen.map((file) => file.path));
      for (const old of base?.entries ?? []) {
        if (!localPaths.has(old.path) && old.remoteSha !== null)
          entries.push({ path: old.path, sha: null });
      }
      const treeSha = await writer.writeTree(token, input.remoteRef, head.treeSha, entries);
      if (!SHA.test(treeSha)) throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
      commitSha = await writer.writeCommit(
        token,
        input.remoteRef,
        treeSha,
        head.sha,
        `Sync project revision ${revision.revision_no}`,
      );
      if (!SHA.test(commitSha)) throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
      // GitHub's non-force ref update rejects a branch that moved after readHead.
      await writer.updateBranch(token, input.remoteRef, branch, commitSha);
    } catch (error) {
      throw mapProviderError(error);
    }

    // The remote update has succeeded. A local persistence failure is surfaced
    // to the caller and never reported as synced.
    const postFiles = await localFilesFromRevision(db, input.sourceRevisionId);
    const remoteEntries: RemoteTreeEntry[] = frozen.map((file) => ({
      path: file.path,
      kind: "file",
      sizeBytes: file.bytes.length,
      sha: entries.find((entry) => entry.path === file.path)!.sha,
    }));
    const agreement = buildAgreement(postFiles, remoteEntries, commitSha);
    await db.transaction(async (tx) => {
      const updated = await tx.query(
        `UPDATE project_integrations SET sync_cursor = $2, last_synced_revision = $3,
           sync_base_manifest = $4::jsonb WHERE id = $1 AND sync_cursor = $5`,
        [
          link.id,
          commitSha,
          revision.revision_no,
          JSON.stringify(agreement),
          input.expectedRemoteSha,
        ],
      );
      if (updated.rowCount !== 1) throw new GitHubPullError(409, "REMOTE_CONFLICT");
      await tx.query(
        `INSERT INTO audit_events
           (actor_id, project_id, action, target_type, target_id, metadata_redacted, request_id)
         VALUES ($1, $2, 'github.push', 'project_revision', $3, $4::jsonb, $5)`,
        [
          input.actorUserId,
          input.projectId,
          input.sourceRevisionId,
          JSON.stringify({
            remoteRef: input.remoteRef,
            branch,
            expectedRemoteSha: input.expectedRemoteSha,
            remoteSha: commitSha,
            manifestHash: revision.manifest_hash,
          }),
          randomUUID(),
        ],
      );
    });
    return {
      status: "synced",
      remoteSha: commitSha,
      sourceRevisionId: input.sourceRevisionId,
      sourceManifestHash: revision.manifest_hash,
      branch,
      pushedPaths: frozen.map((file) => file.path),
    };
  }
  return { push };
}
