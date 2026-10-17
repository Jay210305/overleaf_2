import { createHash } from "node:crypto";
import { RevisionsRepository, isUUID, type DatabaseClient } from "@latex-collab/db";
import { maxFileBytes, maxProjectBytes, maxProjectNodes } from "@latex-collab/storage";

/**
 * S12-T03 pull planning for linked GitHub repositories.
 *
 * A pull validates the linked repository/branch and its base SHA, freezes the
 * local canonical state as an immutable checkpoint revision ("snapshot local
 * state") and classifies every path into safe pull actions or explicit
 * conflicts. It never applies remote content and never writes live Yjs state:
 * application through the canonical service is S12-T08 work, so a divergent
 * remote SHA, a token failure or a concurrent local/remote/binary change is
 * surfaced instead of silently overwritten.
 */

export const GITHUB_SYNC_PROVIDER = "github" as const;
export const PULL_SNAPSHOT_SOURCE = "github-pull" as const;

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const REMOTE_REF_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type PullErrorCode =
  | "VALIDATION_ERROR"
  | "RESOURCE_NOT_FOUND"
  | "TOKEN_EXPIRED"
  | "CREDENTIALS_MISSING"
  | "RATE_LIMITED"
  | "REMOTE_CONFLICT"
  | "QUOTA_EXCEEDED"
  | "PROVIDER_UNAVAILABLE"
  // Apply-time codes (S12-T08): the frozen plan no longer matches live local
  // state (REVISION_CONFLICT) and remote bytes rejected by the content policy
  // (UNSUPPORTED_CONTENT).
  | "REVISION_CONFLICT"
  | "UNSUPPORTED_CONTENT";

/** Jobs-side equivalent of the API auth error: HTTP-ready status plus problem code. */
export class GitHubPullError extends Error {
  readonly status: number;
  readonly code: PullErrorCode;

  constructor(status: number, code: PullErrorCode) {
    super(code);
    this.name = "GitHubPullError";
    this.status = status;
    this.code = code;
  }
}

export interface RemoteTreeEntry {
  path: string;
  kind: "file" | "folder";
  sizeBytes: number;
  sha: string | null;
}
export interface RemoteTree {
  sha: string;
  defaultBranch: string;
  entries: RemoteTreeEntry[];
}
/**
 * Injected provider port. Implementations must throw errors carrying a
 * provider `code` (TOKEN_EXPIRED, RATE_LIMITED, PROVIDER_UNAVAILABLE, ...);
 * anything else is mapped to PROVIDER_UNAVAILABLE without leaking details.
 */
export interface GitHubPullReader {
  readTree(token: string, remoteRef: string, branch: string): Promise<RemoteTree>;
}
export type DecryptCredential = (encryptedCredentialRef: string) => string;

export interface LocalFile {
  path: string;
  kind: "text" | "binary";
  fingerprint: string;
  sizeBytes: number;
}

export interface SyncBaseEntry {
  path: string;
  kind: "text" | "binary";
  localFingerprint: string;
  remoteSha: string | null;
}
export interface SyncBaseManifest {
  version: 1;
  remoteSha: string;
  entries: SyncBaseEntry[];
}

export type PullAction =
  "add" | "update" | "delete" | "keep-local" | "keep-deleted" | "unchanged" | "conflict";

export interface PullEntry {
  path: string;
  action: PullAction;
  localKind: "text" | "binary" | "folder" | null;
  remoteKind: "file" | "folder" | null;
  localFingerprint: string | null;
  remoteSha: string | null;
  sizeBytes: number | null;
}
export interface PullConflict {
  path: string;
  kind: "text" | "binary" | "tree";
}

export interface GitHubPullInput {
  actorUserId: string;
  projectId: string;
  remoteRef: string;
  branch?: string;
  expectedRemoteSha: string;
  sourceRevisionId?: string;
  resolutions?: Array<{ path: string; decision: "keep-local" | "keep-remote" | "manual" }>;
}

export interface GitHubPullResult {
  status: "synced" | "changes" | "conflict";
  remoteRef: string;
  branch: string;
  remoteSha: string;
  localRevisionId: string;
  localRevisionNo: number;
  entries: PullEntry[];
  conflicts: PullConflict[];
  baseRecorded: boolean;
}

export interface GitHubPullServiceOptions {
  db: DatabaseClient;
  reader: GitHubPullReader;
  decryptCredential: DecryptCredential;
}

export function fingerprintText(content: string): string {
  return createHash("sha256").update(`text:${content}`, "utf8").digest("hex");
}

export function fingerprintBinary(blobKey: string): string {
  return createHash("sha256").update(`binary:${blobKey}`, "utf8").digest("hex");
}

const IGNORED_EXTENSIONS = [
  ".aux",
  ".log",
  ".out",
  ".toc",
  ".synctex.gz",
  ".fls",
  ".fdb_latexmk",
  ".pem",
  ".key",
];

/**
 * The integration contract explicitly ignores `.git`, dotenv secrets and TeX
 * build output so they are never pulled into canonical project state.
 */
export function isIgnoredRemotePath(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((segment) => segment === ".git")) return true;
  const name = segments.at(-1)!;
  if (name === ".env" || name.startsWith(".env.")) return true;
  const lower = name.toLowerCase();
  return IGNORED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function assertSafeRemotePath(path: string): void {
  if (typeof path !== "string" || path.length === 0 || path.length > 1000)
    throw new GitHubPullError(400, "VALIDATION_ERROR");
  if (path !== path.normalize("NFC") || path.includes("\\") || path.includes("\0"))
    throw new GitHubPullError(400, "VALIDATION_ERROR");
  if (path.startsWith("/")) throw new GitHubPullError(400, "VALIDATION_ERROR");
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..")
      throw new GitHubPullError(400, "VALIDATION_ERROR");
  }
}

/**
 * Validates remote paths/sizes/counts and filters ignored entries. Unsafe
 * paths reject the whole pull; ignored paths are excluded silently by policy.
 */
export function validateRemoteTree(entries: RemoteTreeEntry[]): RemoteTreeEntry[] {
  const accepted: RemoteTreeEntry[] = [];
  let fileCount = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    assertSafeRemotePath(entry.path);
    if (entry.kind !== "file" && entry.kind !== "folder")
      throw new GitHubPullError(400, "VALIDATION_ERROR");
    if (isIgnoredRemotePath(entry.path)) continue;
    if (entry.kind === "file") {
      if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0)
        throw new GitHubPullError(400, "VALIDATION_ERROR");
      if (entry.sizeBytes > maxFileBytes) throw new GitHubPullError(413, "QUOTA_EXCEEDED");
      fileCount += 1;
      totalBytes += entry.sizeBytes;
      if (fileCount > maxProjectNodes || totalBytes > maxProjectBytes)
        throw new GitHubPullError(413, "QUOTA_EXCEEDED");
    }
    accepted.push(entry);
  }
  return accepted;
}

function conflictKind(entry: PullEntry): PullConflict["kind"] {
  if (entry.localKind === null || entry.remoteKind === null) return "tree";
  if (entry.localKind === "folder" || entry.remoteKind === "folder") return "tree";
  if (entry.localKind === "binary") return "binary";
  return "text";
}

/**
 * Three-way classification of frozen local files against the remote tree.
 * With a recorded agreement both sides are compared per path; without one the
 * classification stays conservative: shared paths are conflicts, never
 * overwrites. Folders only participate in kind-mismatch conflicts.
 */
export function classifyPull(input: {
  base: SyncBaseManifest | null;
  localFiles: LocalFile[];
  remoteEntries: RemoteTreeEntry[];
}): { entries: PullEntry[]; conflicts: PullConflict[] } {
  const baseByPath = new Map<string, SyncBaseEntry>(
    (input.base?.entries ?? []).map((entry) => [entry.path, entry]),
  );
  const localByPath = new Map<string, LocalFile>(input.localFiles.map((file) => [file.path, file]));
  const remoteFiles = new Map<string, RemoteTreeEntry>();
  const remoteFolders = new Set<string>();
  for (const entry of input.remoteEntries) {
    if (entry.kind === "file") remoteFiles.set(entry.path, entry);
    else remoteFolders.add(entry.path);
  }
  const localFolders = new Set<string>();
  for (const file of input.localFiles) {
    const segments = file.path.split("/");
    for (let depth = 1; depth < segments.length; depth += 1)
      localFolders.add(segments.slice(0, depth).join("/"));
  }

  const paths = new Set<string>([
    ...localByPath.keys(),
    ...remoteFiles.keys(),
    ...localFolders,
    ...remoteFolders,
  ]);
  const entries: PullEntry[] = [];
  for (const path of [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const local = localByPath.get(path);
    const localFolder = localFolders.has(path);
    const remote = remoteFiles.get(path);
    const remoteFolder = remoteFolders.has(path);

    if ((local && remoteFolder) || (localFolder && remote)) {
      entries.push({
        path,
        action: "conflict",
        localKind: local?.kind ?? "folder",
        remoteKind: remote ? "file" : "folder",
        localFingerprint: local?.fingerprint ?? null,
        remoteSha: remote?.sha ?? null,
        sizeBytes: remote?.sizeBytes ?? local?.sizeBytes ?? null,
      });
      continue;
    }
    if (local && remote) {
      const base = baseByPath.get(path);
      const localChanged = base
        ? base.kind !== local.kind || base.localFingerprint !== local.fingerprint
        : true;
      const remoteChanged = base ? remote.sha === null || base.remoteSha !== remote.sha : true;
      let action: PullAction;
      if (!base) action = "conflict";
      else if (!localChanged && !remoteChanged) action = "unchanged";
      else if (!localChanged && remoteChanged) action = "update";
      else if (localChanged && !remoteChanged) action = "keep-local";
      else action = "conflict";
      entries.push({
        path,
        action,
        localKind: local.kind,
        remoteKind: "file",
        localFingerprint: local.fingerprint,
        remoteSha: remote.sha,
        sizeBytes: remote.sizeBytes,
      });
      continue;
    }
    if (local) {
      const base = baseByPath.get(path);
      if (!base || base.remoteSha === null) {
        entries.push({
          path,
          action: "keep-local",
          localKind: local.kind,
          remoteKind: null,
          localFingerprint: local.fingerprint,
          remoteSha: null,
          sizeBytes: local.sizeBytes,
        });
      } else if (base.kind !== local.kind || base.localFingerprint !== local.fingerprint) {
        entries.push({
          path,
          action: "conflict",
          localKind: local.kind,
          remoteKind: null,
          localFingerprint: local.fingerprint,
          remoteSha: null,
          sizeBytes: local.sizeBytes,
        });
      } else {
        entries.push({
          path,
          action: "delete",
          localKind: local.kind,
          remoteKind: null,
          localFingerprint: local.fingerprint,
          remoteSha: null,
          sizeBytes: local.sizeBytes,
        });
      }
      continue;
    }
    if (remote) {
      const base = baseByPath.get(path);
      if (!base) {
        entries.push({
          path,
          action: "add",
          localKind: null,
          remoteKind: "file",
          localFingerprint: null,
          remoteSha: remote.sha,
          sizeBytes: remote.sizeBytes,
        });
      } else if (remote.sha !== null && base.remoteSha === remote.sha) {
        entries.push({
          path,
          action: "keep-deleted",
          localKind: null,
          remoteKind: "file",
          localFingerprint: null,
          remoteSha: remote.sha,
          sizeBytes: remote.sizeBytes,
        });
      } else {
        entries.push({
          path,
          action: "conflict",
          localKind: null,
          remoteKind: "file",
          localFingerprint: null,
          remoteSha: remote.sha,
          sizeBytes: remote.sizeBytes,
        });
      }
      continue;
    }
    // A path that is a folder on the only side that has it carries no file
    // content; child files are classified individually.
  }

  const conflicts: PullConflict[] = entries
    .filter((entry) => entry.action === "conflict")
    .map((entry) => ({ path: entry.path, kind: conflictKind(entry) }));
  return { entries, conflicts };
}

const PROVIDER_ERROR_STATUS: Record<string, { status: number; code: PullErrorCode }> = {
  TOKEN_EXPIRED: { status: 401, code: "TOKEN_EXPIRED" },
  CREDENTIALS_MISSING: { status: 401, code: "CREDENTIALS_MISSING" },
  RATE_LIMITED: { status: 429, code: "RATE_LIMITED" },
  REMOTE_CONFLICT: { status: 409, code: "REMOTE_CONFLICT" },
  RESOURCE_NOT_FOUND: { status: 404, code: "RESOURCE_NOT_FOUND" },
  QUOTA_EXCEEDED: { status: 413, code: "QUOTA_EXCEEDED" },
  PROVIDER_UNAVAILABLE: { status: 502, code: "PROVIDER_UNAVAILABLE" },
};

export function mapProviderError(error: unknown): GitHubPullError {
  if (error instanceof GitHubPullError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code in PROVIDER_ERROR_STATUS)
    return new GitHubPullError(
      PROVIDER_ERROR_STATUS[code]!.status,
      PROVIDER_ERROR_STATUS[code]!.code,
    );
  return new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
}

export function parseSyncBase(raw: unknown): SyncBaseManifest | null {
  if (raw === null || raw === undefined) return null;
  try {
    const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    const candidate = value as { version?: unknown; remoteSha?: unknown; entries?: unknown };
    if (
      candidate?.version !== 1 ||
      typeof candidate.remoteSha !== "string" ||
      !Array.isArray(candidate.entries)
    )
      return null;
    const entries: SyncBaseEntry[] = [];
    for (const item of candidate.entries as Array<Record<string, unknown>>) {
      if (
        typeof item?.path !== "string" ||
        (item.kind !== "text" && item.kind !== "binary") ||
        typeof item.localFingerprint !== "string" ||
        (item.remoteSha !== null && typeof item.remoteSha !== "string")
      )
        return null;
      entries.push({
        path: item.path,
        kind: item.kind,
        localFingerprint: item.localFingerprint,
        remoteSha: item.remoteSha as string | null,
      });
    }
    return { version: 1, remoteSha: candidate.remoteSha, entries };
  } catch {
    // A malformed agreement degrades to conservative classification, which
    // never overwrites local state, instead of failing the pull outright.
    return null;
  }
}

/** Minimal query executor for pool clients and transactions. */
type Queryable = { query: DatabaseClient["query"] };

export async function localFilesFromRevision(
  db: Queryable,
  revisionId: string,
): Promise<LocalFile[]> {
  const rows = await db.query<{
    node_id: string;
    path: string;
    blob_key: string | null;
    sha256: string;
    content_kind: string | null;
    size_bytes: string | null;
    text_bytes: Buffer | null;
  }>(
    `SELECT node_id, path, blob_key, sha256, content_kind, size_bytes, text_bytes
     FROM revision_items
     WHERE revision_id = $1 AND deleted = false
     ORDER BY path ASC`,
    [revisionId],
  );
  const files: LocalFile[] = [];
  for (const row of rows.rows) {
    if (row.content_kind === "TEXT" && row.text_bytes !== null) {
      files.push({
        path: row.path,
        kind: "text",
        fingerprint: fingerprintText(row.text_bytes.toString("utf8")),
        sizeBytes: Number(row.size_bytes ?? 0),
      });
    } else if (row.content_kind === "BINARY") {
      files.push({
        path: row.path,
        kind: "binary",
        fingerprint: fingerprintBinary(row.blob_key ?? `item:${row.sha256}`),
        sizeBytes: Number(row.size_bytes ?? 0),
      });
    } else {
      // Legacy revisions have no frozen content and cannot be sync inputs.
      throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
    }
  }
  return files;
}

export function buildAgreement(
  localFiles: LocalFile[],
  accepted: RemoteTreeEntry[],
  remoteSha: string,
): SyncBaseManifest {
  const remoteByPath = new Map<string, RemoteTreeEntry>(
    accepted.filter((entry) => entry.kind === "file").map((entry) => [entry.path, entry]),
  );
  const entries: SyncBaseEntry[] = localFiles.map((file) => ({
    path: file.path,
    kind: file.kind,
    localFingerprint: file.fingerprint,
    remoteSha: remoteByPath.get(file.path)?.sha ?? null,
  }));
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { version: 1, remoteSha, entries };
}

export function createGitHubPullService(options: GitHubPullServiceOptions) {
  const { db, reader, decryptCredential } = options;
  const revisions = new RevisionsRepository(db);

  async function pull(input: GitHubPullInput): Promise<GitHubPullResult> {
    if (!isUUID(input.actorUserId) || !isUUID(input.projectId))
      throw new GitHubPullError(400, "VALIDATION_ERROR");
    if (!SHA_PATTERN.test(input.expectedRemoteSha))
      throw new GitHubPullError(400, "VALIDATION_ERROR");
    if (!REMOTE_REF_PATTERN.test(input.remoteRef))
      throw new GitHubPullError(400, "VALIDATION_ERROR");
    if (input.sourceRevisionId !== undefined && !isUUID(input.sourceRevisionId))
      throw new GitHubPullError(400, "VALIDATION_ERROR");

    const project = await db.query<{ owner_id: string; status: string }>(
      "SELECT owner_id, status FROM projects WHERE id = $1",
      [input.projectId],
    );
    const projectRow = project.rows[0];
    if (!projectRow || projectRow.status === "trashed")
      throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");

    if (projectRow.owner_id !== input.actorUserId) {
      const member = await db.query<{ role: string }>(
        "SELECT role FROM active_project_members WHERE project_id = $1 AND user_id = $2",
        [input.projectId, input.actorUserId],
      );
      const role = member.rows[0]?.role;
      if (role !== "OWNER" && role !== "EDITOR")
        throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
    }

    const integration = await db.query<{
      id: string;
      connection_id: string;
      branch: string | null;
      sync_cursor: string | null;
      sync_base_manifest: unknown;
    }>(
      `SELECT id, connection_id, branch, sync_cursor, sync_base_manifest
       FROM project_integrations
       WHERE project_id = $1 AND provider = $2 AND remote_ref = $3`,
      [input.projectId, GITHUB_SYNC_PROVIDER, input.remoteRef],
    );
    const integrationRow = integration.rows[0];
    if (!integrationRow) throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");

    if (
      input.branch !== undefined &&
      integrationRow.branch &&
      input.branch !== integrationRow.branch
    )
      throw new GitHubPullError(400, "VALIDATION_ERROR");
    const branch = input.branch ?? integrationRow.branch;
    if (!branch) throw new GitHubPullError(400, "VALIDATION_ERROR");

    // The caller's expected base must match the last synced remote SHA; a
    // divergence means an unseen remote advance and is never fake-synced.
    if (integrationRow.sync_cursor && integrationRow.sync_cursor !== input.expectedRemoteSha)
      throw new GitHubPullError(409, "REMOTE_CONFLICT");

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

    let tree: RemoteTree;
    try {
      tree = await reader.readTree(token, input.remoteRef, branch);
    } catch (error) {
      throw mapProviderError(error);
    }
    if (!SHA_PATTERN.test(tree?.sha ?? "")) throw new GitHubPullError(502, "PROVIDER_UNAVAILABLE");
    if (tree.sha !== input.expectedRemoteSha) throw new GitHubPullError(409, "REMOTE_CONFLICT");

    const accepted = validateRemoteTree(tree.entries);

    // Freeze/checkpoint the local state before comparing, so concurrent live
    // edits cannot change the plan mid-classification.
    let localRevisionId: string;
    let localRevisionNo: number;
    if (input.sourceRevisionId) {
      const frozen = await db.query<{ revision_no: string }>(
        "SELECT revision_no FROM project_revisions WHERE id = $1 AND project_id = $2",
        [input.sourceRevisionId, input.projectId],
      );
      if (!frozen.rows[0]) throw new GitHubPullError(404, "RESOURCE_NOT_FOUND");
      localRevisionId = input.sourceRevisionId;
      localRevisionNo = Number(frozen.rows[0].revision_no);
    } else {
      const snapshot = await revisions.createStructuralRevision({
        projectId: input.projectId,
        authorId: input.actorUserId,
        source: PULL_SNAPSHOT_SOURCE,
        label: "Pre-pull snapshot",
      });
      localRevisionId = snapshot.id;
      localRevisionNo = snapshot.revisionNo;
    }

    const localFiles = await localFilesFromRevision(db, localRevisionId);
    const base = parseSyncBase(integrationRow.sync_base_manifest);
    const { entries, conflicts } = classifyPull({ base, localFiles, remoteEntries: accepted });
    const status =
      conflicts.length > 0
        ? "conflict"
        : entries.some(
              (entry) =>
                entry.action === "add" || entry.action === "update" || entry.action === "delete",
            )
          ? "changes"
          : "synced";

    let baseRecorded = false;
    if (status === "synced") {
      // A fully clean pull means both sides already agree: record the
      // agreement so later pulls classify three-way instead of conservatively.
      const agreement = buildAgreement(localFiles, accepted, tree.sha);
      await db.query(
        `UPDATE project_integrations
         SET sync_base_manifest = $2::jsonb, sync_cursor = $3, last_synced_revision = $4
         WHERE id = $1`,
        [integrationRow.id, JSON.stringify(agreement), tree.sha, String(localRevisionNo)],
      );
      baseRecorded = true;
    }

    return {
      status,
      remoteRef: input.remoteRef,
      branch,
      remoteSha: tree.sha,
      localRevisionId,
      localRevisionNo,
      entries,
      conflicts,
      baseRecorded,
    };
  }

  return { pull };
}
