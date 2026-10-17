import type { FastifyInstance, FastifyReply } from "fastify";
import {
  githubLinkInputSchema,
  githubLinkResultSchema,
  githubRepoSchema,
  type GitHubLinkResult,
  type GitHubRepo,
} from "@latex-collab/contracts";
import type { DatabaseClient } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import { createProject } from "../projects/create.js";
import {
  decryptToken,
  GITHUB_PROVIDER,
  type GitHubOAuthConfig,
  type MemoryOAuthStateStore,
} from "./github-auth.js";

export interface RemoteTreeEntry {
  path: string;
  kind: "file" | "folder";
  sizeBytes: number;
}
export interface RemoteTree {
  sha: string;
  defaultBranch: string;
  entries: RemoteTreeEntry[];
}
export interface RemoteReader {
  listRepos(token: string): Promise<GitHubRepo[]>;
  readTree(token: string, remoteRef: string, branch: string): Promise<RemoteTree>;
}

export interface GitHubLinkOptions {
  db: DatabaseClient;
  config: GitHubOAuthConfig;
  reader: RemoteReader;
}

interface LocalEntry {
  path: string;
  kind: "file" | "folder";
}

async function localManifest(db: DatabaseClient, projectId: string): Promise<LocalEntry[]> {
  const rows = await db.query<{ id: string; parent_id: string | null; name: string; kind: string }>(
    `SELECT id, parent_id, name, kind FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL`,
    [projectId],
  );
  const byId = new Map(rows.rows.map((row) => [row.id, row]));
  const entries: LocalEntry[] = [];
  for (const row of rows.rows) {
    const parts: string[] = [row.name];
    let parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    while (parent) {
      parts.unshift(parent.name);
      parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
    }
    entries.push({ path: parts.join("/"), kind: row.kind === "FOLDER" ? "folder" : "file" });
  }
  return entries;
}

export function compareManifests(
  local: LocalEntry[],
  remote: RemoteTreeEntry[],
): { comparison: GitHubLinkResult["comparison"]; conflict: boolean } {
  const localByPath = new Map(local.map((entry) => [entry.path, entry.kind]));
  const remoteByPath = new Map(remote.map((entry) => [entry.path, entry.kind]));
  const comparison: GitHubLinkResult["comparison"] = [];
  for (const [path, kind] of localByPath) {
    const remoteKind = remoteByPath.get(path);
    if (!remoteKind)
      comparison.push({ path, side: "only-local", localKind: kind, remoteKind: null });
    else if (remoteKind !== kind)
      comparison.push({ path, side: "differing", localKind: kind, remoteKind });
  }
  for (const [path, kind] of remoteByPath) {
    if (!localByPath.has(path))
      comparison.push({ path, side: "only-remote", localKind: null, remoteKind: kind });
  }
  comparison.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { comparison, conflict: comparison.some((entry) => entry.side === "differing") };
}

async function ownedConnection(
  db: DatabaseClient,
  userId: string,
  connectionId: string,
): Promise<{ id: string; encryptedRef: string }> {
  const rows = await db.query<{ id: string; encrypted_credential_ref: string }>(
    `SELECT id, encrypted_credential_ref FROM external_connections
     WHERE id = $1 AND user_id = $2 AND provider = $3 AND status = 'active' LIMIT 1`,
    [connectionId, userId, GITHUB_PROVIDER],
  );
  const row = rows.rows[0];
  if (!row) throw new AuthError(404, "RESOURCE_NOT_FOUND");
  return { id: row.id, encryptedRef: row.encrypted_credential_ref };
}

async function requireEditorRole(
  db: DatabaseClient,
  userId: string,
  projectId: string,
): Promise<void> {
  const project = await db.query<{ owner_id: string }>(
    "SELECT owner_id FROM projects WHERE id = $1",
    [projectId],
  );
  const ownerId = project.rows[0]?.owner_id;
  if (!ownerId) throw new AuthError(404, "RESOURCE_NOT_FOUND");
  if (ownerId === userId) return;
  const member = await db.query<{ role: string }>(
    "SELECT role FROM active_project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId],
  );
  const role = member.rows[0]?.role;
  if (role !== "EDITOR" && role !== "OWNER") throw new AuthError(404, "RESOURCE_NOT_FOUND");
}

export function createGitHubLinkService(options: GitHubLinkOptions) {
  async function listRepos(userId: string, connectionId: string): Promise<GitHubRepo[]> {
    const connection = await ownedConnection(options.db, userId, connectionId);
    const token = decryptToken(options.config.encryptionKey, connection.encryptedRef);
    try {
      const repos = await options.reader.listRepos(token);
      return repos.map((repo) => githubRepoSchema.parse(repo));
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError(502, "PROVIDER_UNAVAILABLE");
    }
  }

  async function link(userId: string, input: unknown): Promise<GitHubLinkResult> {
    const parsed = githubLinkInputSchema.safeParse(input);
    if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
    const { connectionId, mode, remoteRef } = parsed.data;
    const connection = await ownedConnection(options.db, userId, connectionId);
    const token = decryptToken(options.config.encryptionKey, connection.encryptedRef);

    let projectId = parsed.data.projectId;
    if (mode === "pair-existing") {
      if (!projectId) throw new AuthError(400, "VALIDATION_ERROR");
      await requireEditorRole(options.db, userId, projectId);
    } else if (projectId) {
      throw new AuthError(400, "VALIDATION_ERROR");
    }

    let tree: RemoteTree;
    try {
      const branch = parsed.data.branch;
      if (!branch) {
        const repos = await options.reader.listRepos(token);
        const match = repos.find((repo) => repo.fullName.toLowerCase() === remoteRef.toLowerCase());
        if (!match) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        tree = await options.reader.readTree(token, remoteRef, match.defaultBranch);
      } else {
        tree = await options.reader.readTree(token, remoteRef, branch);
      }
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError(502, "PROVIDER_UNAVAILABLE");
    }
    if (parsed.data.expectedRemoteSha && parsed.data.expectedRemoteSha !== tree.sha)
      throw new AuthError(409, "REMOTE_CONFLICT");

    if (mode === "import-new") {
      const created = await createProject(options.db, userId, {
        title: parsed.data.title ?? remoteRef.split("/")[1] ?? remoteRef,
        compiler: "pdflatex",
      });
      projectId = created.id;
    }

    const local = await localManifest(options.db, projectId!);
    const { comparison, conflict } = compareManifests(local, tree.entries);
    await options.db.query(
      `INSERT INTO project_integrations (project_id, connection_id, provider, remote_ref, branch, last_synced_revision, sync_cursor)
       VALUES ($1, $2, $3, $4, $5, NULL, $6)
       ON CONFLICT (project_id, provider, remote_ref)
       DO UPDATE SET connection_id = EXCLUDED.connection_id, branch = EXCLUDED.branch, sync_cursor = EXCLUDED.sync_cursor`,
      [
        projectId,
        connection.id,
        GITHUB_PROVIDER,
        remoteRef,
        parsed.data.branch ?? tree.defaultBranch,
        tree.sha,
      ],
    );
    return githubLinkResultSchema.parse({
      projectId,
      connectionId: connection.id,
      mode,
      remoteRef,
      branch: parsed.data.branch ?? tree.defaultBranch,
      remoteSha: tree.sha,
      comparison,
      conflict,
    });
  }

  return { listRepos, link };
}

function handleGitHubLinkError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  return reply
    .code(503)
    .type("application/problem+json")
    .send(problem(503, "SERVICE_UNAVAILABLE", requestId));
}

export interface GitHubLinkRouteOptions {
  db?: DatabaseClient | undefined;
  githubAuth?:
    | {
        config?: GitHubOAuthConfig | undefined;
        store?: MemoryOAuthStateStore | undefined;
        reader?: RemoteReader | undefined;
      }
    | undefined;
}

/**
 * Links an authorized repository/branch to a project. Linking records the
 * remote ref and a manifest comparison only; content sync is later work and
 * nothing is ever force-merged.
 */
export function registerGitHubLinkRoutes(
  app: FastifyInstance,
  options: GitHubLinkRouteOptions,
): void {
  const identity = (request: { sessionIdentity?: unknown }): { userId: string } | undefined => {
    const value = request.sessionIdentity as { userId: string } | undefined;
    return typeof value?.userId === "string" ? { userId: value.userId } : undefined;
  };
  const service = () => {
    if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
    if (!options.githubAuth?.config || !options.githubAuth.reader)
      throw new AuthError(503, "CREDENTIALS_MISSING");
    return createGitHubLinkService({
      db: options.db,
      config: options.githubAuth.config,
      reader: options.githubAuth.reader,
    });
  };

  app.get(
    "/api/v1/integrations/github/repos",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        const actor = identity(request);
        if (!actor) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const { connectionId } = request.query as { connectionId?: unknown };
        if (typeof connectionId !== "string") throw new AuthError(400, "VALIDATION_ERROR");
        return reply
          .code(200)
          .type("application/json")
          .send({
            repos: await service().listRepos(actor.userId, connectionId),
          });
      } catch (error) {
        return handleGitHubLinkError(error, reply, request.id);
      }
    },
  );

  app.post(
    "/api/v1/integrations/github/link",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        const actor = identity(request);
        if (!actor) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        return reply
          .code(200)
          .type("application/json")
          .send(await service().link(actor.userId, request.body));
      } catch (error) {
        return handleGitHubLinkError(error, reply, request.id);
      }
    },
  );
}
