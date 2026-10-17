import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RevisionsRepository } from "../../packages/db/src/repositories/revisions.js";
import { createSessionFixture } from "../helpers/s02-session.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { decryptToken, encryptToken } from "../../apps/api/src/modules/integrations/github-auth.js";
import {
  GitHubPullError,
  createGitHubPullService,
  fingerprintBinary,
  fingerprintText,
  type RemoteTree,
  type RemoteTreeEntry,
  type SyncBaseManifest,
} from "../../apps/jobs/src/sync/github-pull.js";

loadEnvFile(".env");

const ENCRYPTION_KEY = "test-encryption-key-min-16-chars!!";
const TEST_TOKEN = "gho_s12_t03_token";
const MAIN_CONTENT = "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}\n";
const MAIN_EDITED =
  "\\documentclass{article}\n\\begin{document}\nEdited offline\n\\end{document}\n";
const sha = (c: string) => c.repeat(40);
const remoteFile = (path: string, shaValue: string | null, sizeBytes = 10): RemoteTreeEntry => ({
  path,
  kind: "file",
  sizeBytes,
  sha: shaValue,
});
const remoteFolder = (path: string): RemoteTreeEntry => ({
  path,
  kind: "folder",
  sizeBytes: 0,
  sha: null,
});
const actionsOf = (entries: Array<{ action: string; path: string }>) =>
  entries.map((entry) => `${entry.action}:${entry.path}`);

describe("S12-T03 pull using checkpoint and base SHA", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let db: Awaited<ReturnType<typeof createSessionFixture>>["db"];
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let strangerId: string;
  let connectionId: string;
  let readerMode: "ok" | "expired" | "down" | "traversal" | "huge" = "ok";
  let tree: RemoteTree;
  let service: ReturnType<typeof createGitHubPullService>;

  const rejects = async (promise: Promise<unknown>, status: number, code: string) => {
    try {
      await promise;
      throw new Error("expected the pull to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubPullError);
      const pullError = error as GitHubPullError;
      expect(pullError.status).toBe(status);
      expect(pullError.code).toBe(code);
    }
  };

  const revisionCount = async (projectId: string) =>
    Number(
      (
        await db.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM project_revisions WHERE project_id = $1",
          [projectId],
        )
      ).rows[0]!.count,
    );

  const currentRevision = async (projectId: string) =>
    Number(
      (
        await db.query<{ current_revision: string }>(
          "SELECT current_revision FROM projects WHERE id = $1",
          [projectId],
        )
      ).rows[0]!.current_revision,
    );

  const linkedProject = async (
    title: string,
    options: { cursor?: string; base?: SyncBaseManifest | null } = {},
  ): Promise<{ id: string; mainFileId: string }> => {
    const project = await createProject(db, ownerId, { title, compiler: "pdflatex" });
    await db.query(
      `INSERT INTO project_integrations
         (project_id, connection_id, provider, remote_ref, branch, sync_cursor, sync_base_manifest)
       VALUES ($1, $2, 'github', 'octo/docs', 'main', $3, $4)`,
      [
        project.id,
        connectionId,
        options.cursor ?? sha("1"),
        options.base ? JSON.stringify(options.base) : null,
      ],
    );
    const mainFileId = project.mainFileId;
    if (!mainFileId) throw new Error("createProject returned no main file");
    return { id: project.id, mainFileId };
  };

  const textDocs = new Map<string, Y.Doc>();
  const writeText = async (nodeId: string, previous: string | null, next: string, seq: number) => {
    // Keep one Y.Doc per node so later updates are deltas anchored to the
    // replayed state instead of full states from a fresh client id.
    let doc = textDocs.get(nodeId);
    if (!doc) {
      doc = new Y.Doc();
      if (previous !== null) doc.getText("content").insert(0, previous);
      textDocs.set(nodeId, doc);
    }
    const stateVector = Y.encodeStateVector(doc);
    doc.getText("content").delete(0, doc.getText("content").length);
    doc.getText("content").insert(0, next);
    const update = Buffer.from(Y.encodeStateAsUpdate(doc, stateVector));
    await db.query(
      `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), nodeId, seq, ownerId, update],
    );
    await db.query("UPDATE text_documents SET last_persisted_seq = $2 WHERE file_id = $1", [
      nodeId,
      seq,
    ]);
  };

  const seedBinary = async (projectId: string, name: string, content: string) => {
    const bytes = Buffer.from(content, "utf8");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const key = `projects/${projectId}/blobs/${hash}`;
    const result = await db.query<{ id: string }>(
      `INSERT INTO project_nodes
         (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, $2, NULL, $3, 'FILE', 'image/png', 'BINARY', $4, $5)
       RETURNING id`,
      [randomUUID(), projectId, name, bytes.length, key],
    );
    return { nodeId: result.rows[0]!.id, key };
  };

  const pull = (projectId: string, actorUserId: string, overrides: Record<string, unknown> = {}) =>
    service.pull({
      actorUserId,
      projectId,
      remoteRef: "octo/docs",
      expectedRemoteSha: tree.sha,
      ...overrides,
    });

  beforeAll(async () => {
    fixture = await createSessionFixture();
    db = fixture.db;
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(80803)");
      await tx.query(
        readFileSync(
          resolve(import.meta.dirname, "../../packages/db/migrations/0013-github-sync-base.sql"),
          "utf8",
        ),
      );
    });
    ownerId = (await fixture.seed()).id;
    editorId = (await fixture.seed()).id;
    viewerId = (await fixture.seed()).id;
    strangerId = (await fixture.seed()).id;
    const connection = await db.query<{ id: string }>(
      `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, 'github', $2, '["repo"]'::jsonb, 'active') RETURNING id`,
      [ownerId, encryptToken(ENCRYPTION_KEY, TEST_TOKEN)],
    );
    connectionId = connection.rows[0]!.id;
    tree = { sha: sha("1"), defaultBranch: "main", entries: [] };
    service = createGitHubPullService({
      db,
      decryptCredential: (ref) => decryptToken(ENCRYPTION_KEY, ref),
      reader: {
        readTree: async () => {
          if (readerMode === "expired") throw new GitHubPullError(401, "TOKEN_EXPIRED");
          if (readerMode === "down") throw new Error("provider connection reset");
          if (readerMode === "traversal")
            return { ...tree, entries: [remoteFile("../evil.tex", sha("e"))] };
          if (readerMode === "huge")
            return { ...tree, entries: [remoteFile("huge.bin", sha("f"), 25 * 1024 * 1024 + 1)] };
          return tree;
        },
      },
    });
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it("builds a conservative first-pull plan, snapshots the revision and leaks no token", async () => {
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [
        remoteFile("main.tex", sha("2")),
        remoteFile("chapters/intro.tex", sha("3")),
        remoteFolder("figures"),
      ],
    };
    readerMode = "ok";
    const { id: projectId, mainFileId } = await linkedProject("Conservative pull", {
      cursor: sha("1"),
    });
    await writeText(mainFileId, null, MAIN_CONTENT, 1);

    const result = await pull(projectId, ownerId);

    expect(result.status).toBe("conflict");
    expect(result.remoteSha).toBe(sha("1"));
    expect(result.baseRecorded).toBe(false);
    expect(actionsOf(result.entries)).toEqual(["add:chapters/intro.tex", "conflict:main.tex"]);
    expect(result.conflicts).toEqual([{ path: "main.tex", kind: "text" }]);
    expect(JSON.stringify(result)).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(result)).not.toContain("encrypted");

    const revision = await db.query<{ source: string; revision_no: string; author_id: string }>(
      "SELECT source, revision_no, author_id FROM project_revisions WHERE id = $1",
      [result.localRevisionId],
    );
    expect(revision.rows[0]).toMatchObject({
      source: "github-pull",
      author_id: ownerId,
    });
    expect(Number(revision.rows[0]!.revision_no)).toBe(result.localRevisionNo);
    expect(await currentRevision(projectId)).toBe(result.localRevisionNo);

    const integration = await db.query<{ sync_base_manifest: unknown }>(
      "SELECT sync_base_manifest FROM project_integrations WHERE project_id = $1",
      [projectId],
    );
    expect(integration.rows[0]!.sync_base_manifest).toBeNull();
    const updates = await db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM crdt_updates WHERE file_id = $1",
      [mainFileId],
    );
    expect(updates.rows[0]!.count).toBe("1");
  });

  it("rejects a divergent remote SHA or a caller base mismatch without recording a snapshot", async () => {
    tree = { sha: sha("1"), defaultBranch: "main", entries: [remoteFile("intro.tex", sha("3"))] };
    readerMode = "ok";
    const { id: projectId } = await linkedProject("Divergent pull", { cursor: sha("1") });
    const before = await revisionCount(projectId);

    await rejects(
      pull(projectId, ownerId, { expectedRemoteSha: sha("f") }),
      409,
      "REMOTE_CONFLICT",
    );
    expect(await revisionCount(projectId)).toBe(before);

    const stale = await linkedProject("Cursor pull", { cursor: sha("d") });
    await rejects(pull(stale.id, ownerId), 409, "REMOTE_CONFLICT");
    expect(await revisionCount(stale.id)).toBe(0);
  });

  it("maps token expiry and provider outages without touching the project", async () => {
    tree = { sha: sha("1"), defaultBranch: "main", entries: [remoteFile("intro.tex", sha("3"))] };
    const { id: projectId } = await linkedProject("Outage pull", { cursor: sha("1") });
    const before = await revisionCount(projectId);

    readerMode = "expired";
    await rejects(pull(projectId, ownerId), 401, "TOKEN_EXPIRED");
    readerMode = "down";
    await rejects(pull(projectId, ownerId), 502, "PROVIDER_UNAVAILABLE");
    readerMode = "ok";
    expect(await revisionCount(projectId)).toBe(before);
  });

  it("rejects unsafe remote paths and oversized entries with state intact", async () => {
    tree = { sha: sha("1"), defaultBranch: "main", entries: [] };
    const { id: projectId } = await linkedProject("Unsafe pull", { cursor: sha("1") });
    const before = await revisionCount(projectId);

    readerMode = "traversal";
    await rejects(pull(projectId, ownerId), 400, "VALIDATION_ERROR");
    readerMode = "huge";
    await rejects(pull(projectId, ownerId), 413, "QUOTA_EXCEEDED");
    readerMode = "ok";
    expect(await revisionCount(projectId)).toBe(before);
  });

  it("authorizes owners and editors while hiding the project from viewers and strangers", async () => {
    tree = { sha: sha("1"), defaultBranch: "main", entries: [remoteFile("intro.tex", sha("3"))] };
    readerMode = "ok";
    const { id: projectId } = await linkedProject("Role pull", { cursor: sha("1") });
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')",
      [projectId, editorId],
    );
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [projectId, viewerId],
    );

    const ownerResult = await pull(projectId, ownerId);
    expect(ownerResult.status).toBe("changes");
    const editorResult = await pull(projectId, editorId);
    expect(actionsOf(editorResult.entries)).toEqual(["add:intro.tex", "keep-local:main.tex"]);
    await rejects(pull(projectId, viewerId), 404, "RESOURCE_NOT_FOUND");
    await rejects(pull(projectId, strangerId), 404, "RESOURCE_NOT_FOUND");
  });

  it("ignores .git, secrets and build output, then records a clean agreement", async () => {
    tree = {
      sha: sha("4"),
      defaultBranch: "main",
      entries: [
        remoteFile(".env", sha("5")),
        remoteFile("main.aux", sha("6")),
        remoteFolder(".git"),
      ],
    };
    readerMode = "ok";
    const { id: projectId, mainFileId } = await linkedProject("Ignored pull", { cursor: sha("4") });
    await writeText(mainFileId, null, MAIN_CONTENT, 1);

    const result = await pull(projectId, ownerId);

    expect(result.status).toBe("synced");
    expect(result.baseRecorded).toBe(true);
    expect(actionsOf(result.entries)).toEqual(["keep-local:main.tex"]);
    const integration = await db.query<{
      sync_cursor: string;
      last_synced_revision: string;
      sync_base_manifest: SyncBaseManifest;
    }>(
      "SELECT sync_cursor, last_synced_revision, sync_base_manifest FROM project_integrations WHERE project_id = $1",
      [projectId],
    );
    expect(integration.rows[0]!.sync_cursor).toBe(sha("4"));
    expect(Number(integration.rows[0]!.last_synced_revision)).toBe(result.localRevisionNo);
    expect(integration.rows[0]!.sync_base_manifest).toEqual({
      version: 1,
      remoteSha: sha("4"),
      entries: [
        {
          path: "main.tex",
          kind: "text",
          localFingerprint: fingerprintText(MAIN_CONTENT),
          remoteSha: null,
        },
      ],
    });
  });

  it("classifies precisely against a seeded agreement: updates, keeps and conflicts", async () => {
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("main.tex", sha("2")), remoteFile("extra.tex", sha("3"))],
    };
    readerMode = "ok";
    const unchanged = await linkedProject("Precise unchanged", {
      cursor: sha("1"),
      base: {
        version: 1,
        remoteSha: sha("0"),
        entries: [
          {
            path: "main.tex",
            kind: "text",
            localFingerprint: fingerprintText(MAIN_CONTENT),
            remoteSha: sha("2"),
          },
        ],
      },
    });
    await writeText(unchanged.mainFileId, null, MAIN_CONTENT, 1);
    const result = await pull(unchanged.id, ownerId);
    expect(actionsOf(result.entries)).toEqual(["add:extra.tex", "unchanged:main.tex"]);
    expect(result.conflicts).toEqual([]);

    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("main.tex", sha("9"))],
    };
    const conflicting = await linkedProject("Precise conflict", {
      cursor: sha("1"),
      base: {
        version: 1,
        remoteSha: sha("0"),
        entries: [
          {
            path: "main.tex",
            kind: "text",
            localFingerprint: fingerprintText(MAIN_CONTENT),
            remoteSha: sha("2"),
          },
        ],
      },
    });
    await writeText(conflicting.mainFileId, null, MAIN_CONTENT, 1);
    await writeText(conflicting.mainFileId, MAIN_CONTENT, MAIN_EDITED, 2);
    const conflicted = await pull(conflicting.id, ownerId);
    expect(actionsOf(conflicted.entries)).toEqual(["conflict:main.tex"]);
    expect(conflicted.conflicts).toEqual([{ path: "main.tex", kind: "text" }]);
    expect(conflicted.entries[0]).toMatchObject({
      localFingerprint: fingerprintText(MAIN_EDITED),
      remoteSha: sha("9"),
    });
  });

  it("surfaces binary conflicts and keeps a local-only edit from being overwritten", async () => {
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("scan.png", sha("8"))],
    };
    readerMode = "ok";
    const { id: projectId } = await linkedProject("Binary pull", {
      cursor: sha("1"),
      base: {
        version: 1,
        remoteSha: sha("0"),
        entries: [
          {
            path: "scan.png",
            kind: "binary",
            localFingerprint: fingerprintBinary("projects/stale/blobs/old"),
            remoteSha: sha("7"),
          },
        ],
      },
    });
    const binary = await seedBinary(projectId, "scan.png", "new-binary-bytes");
    const result = await pull(projectId, ownerId);
    expect(actionsOf(result.entries)).toEqual(["keep-local:main.tex", "conflict:scan.png"]);
    expect(result.conflicts).toEqual([{ path: "scan.png", kind: "binary" }]);
    expect(result.entries.find((entry) => entry.path === "scan.png")).toMatchObject({
      localKind: "binary",
      localFingerprint: fingerprintBinary(binary.key),
      remoteSha: sha("8"),
    });
  });

  it("reuses a caller-provided frozen revision and rejects foreign revision ids", async () => {
    tree = { sha: sha("1"), defaultBranch: "main", entries: [remoteFile("intro.tex", sha("3"))] };
    readerMode = "ok";
    const { id: projectId, mainFileId } = await linkedProject("Reuse pull", { cursor: sha("1") });
    await writeText(mainFileId, null, MAIN_CONTENT, 1);
    const revisions = new RevisionsRepository(db);
    const frozen = await revisions.createStructuralRevision({
      projectId,
      authorId: ownerId,
      source: "manual",
    });
    const before = await currentRevision(projectId);

    const result = await pull(projectId, ownerId, { sourceRevisionId: frozen.id });
    expect(result.localRevisionId).toBe(frozen.id);
    expect(result.localRevisionNo).toBe(frozen.revisionNo);
    expect(await currentRevision(projectId)).toBe(before);
    expect(await revisionCount(projectId)).toBe(1);

    await rejects(
      pull(projectId, ownerId, { sourceRevisionId: randomUUID() }),
      404,
      "RESOURCE_NOT_FOUND",
    );
  });

  it("rejects malformed input, wrong branches and unlinked repositories", async () => {
    tree = { sha: sha("1"), defaultBranch: "main", entries: [] };
    readerMode = "ok";
    const { id: projectId } = await linkedProject("Guarded pull", { cursor: sha("1") });

    await rejects(
      pull(projectId, ownerId, { expectedRemoteSha: "not-a-sha" }),
      400,
      "VALIDATION_ERROR",
    );
    await rejects(pull(projectId, ownerId, { branch: "release" }), 400, "VALIDATION_ERROR");
    await rejects(
      pull(projectId, ownerId, { remoteRef: "octo/unknown" }),
      404,
      "RESOURCE_NOT_FOUND",
    );
    await rejects(pull(randomUUID(), ownerId), 404, "RESOURCE_NOT_FOUND");
  });
});
