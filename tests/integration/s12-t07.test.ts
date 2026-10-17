import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { RevisionsRepository } from "@latex-collab/db";
import { decryptToken, encryptToken } from "../../apps/api/src/modules/integrations/github-auth.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { DefaultTextDocumentService } from "../../apps/api/src/modules/text/text-document-service.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import {
  buildReplacementUpdate,
  createGitHubApplyService,
  type GitHubApplyReader,
  type SyncInvalidationEvent,
} from "../../apps/jobs/src/sync/apply-changes.js";
import {
  createGitHubPullService,
  fingerprintText,
  type SyncBaseManifest,
} from "../../apps/jobs/src/sync/github-pull.js";
import {
  createGitHubPushService,
  type GitHubPushWriter,
} from "../../apps/jobs/src/sync/github-push.js";
import { createSessionFixture } from "../helpers/s02-session.js";

loadEnvFile(".env");

/**
 * S12-T07 GitHub failure and concurrency verification (INT-05).
 *
 * A stateful in-memory GitHub double backs the real pull, apply and push
 * services so the credentials-blocked live republic is replaced by an
 * equivalent provider that enforces GitHub's non-fast-forward ref rule. The
 * suite proves a push↔pull round trip succeeds and that an expired token, a
 * stale expected SHA, a ref advance and a concurrent edit never overwrite
 * silently and never report a fake synced state.
 */

const ENCRYPTION_KEY = "test-encryption-key-min-16-chars!!";
const TEST_TOKEN = "gho_s12_t07_token";
const MAIN_V1 = "\\documentclass{article}\n\\begin{document}\nLocal T07\n\\end{document}\n";
const MAIN_V2 = "\\documentclass{article}\n\\begin{document}\nRemote T07\n\\end{document}\n";
const MAIN_CONCURRENT =
  "\\documentclass{article}\n\\begin{document}\nConcurrent T07\n\\end{document}\n";

/** In-memory GitHub that stores blobs, trees, commits and branch refs. */
function makeFakeGitHub() {
  let counter = 0;
  const nextSha = () => (counter += 1).toString(16).padStart(40, "0");
  /** Git object identity is a 40-hex SHA-1, matching the provider boundary. */
  const gitSha = (bytes: Uint8Array) => createHash("sha1").update(bytes).digest("hex");
  const blobs = new Map<string, Buffer>();
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, { treeSha: string; parent: string | null }>();
  const refs = new Map<string, string>();
  const calls: string[] = [];
  let beforeUpdate: (() => void) | null = null;
  let onReadFile: ((path: string) => Promise<void>) | null = null;

  function createCommit(parent: string | null, files: Map<string, string>): string {
    const treeSha = nextSha();
    trees.set(treeSha, new Map(files));
    const commitSha = nextSha();
    commits.set(commitSha, { treeSha, parent });
    return commitSha;
  }
  function seedBranch(branch: string): string {
    const commitSha = createCommit(null, new Map());
    refs.set(branch, commitSha);
    return commitSha;
  }
  /** An external actor advancing the branch, as a collaborator's push would. */
  function externalAdvance(): string {
    const current = refs.get("main")!;
    const commitSha = createCommit(current, trees.get(commits.get(current)!.treeSha)!);
    refs.set("main", commitSha);
    return commitSha;
  }
  /** Replaces the remote tree, returning the new head commit. */
  function setRemote(files: Map<string, string>): string {
    const stored = new Map<string, string>();
    for (const [path, content] of files) {
      const bytes = Buffer.from(content);
      const sha = gitSha(bytes);
      blobs.set(sha, bytes);
      stored.set(path, sha);
    }
    const commitSha = createCommit(refs.get("main")!, stored);
    refs.set("main", commitSha);
    return commitSha;
  }
  function treeEntries(treeSha: string): Array<{
    path: string;
    kind: "file" | "folder";
    sizeBytes: number;
    sha: string | null;
  }> {
    const files = trees.get(treeSha) ?? new Map<string, string>();
    const folders = new Set<string>();
    for (const path of files.keys()) {
      const segments = path.split("/");
      for (let index = 1; index < segments.length; index += 1)
        folders.add(segments.slice(0, index).join("/"));
    }
    const entries: ReturnType<typeof treeEntries> = [...folders].map((path) => ({
      path,
      kind: "folder" as const,
      sizeBytes: 0,
      sha: null,
    }));
    for (const [path, blobSha] of files)
      entries.push({
        path,
        kind: "file" as const,
        sizeBytes: blobs.get(blobSha)!.length,
        sha: blobSha,
      });
    return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  const reader: GitHubApplyReader = {
    readTree: async () => {
      calls.push("readTree");
      const commitSha = refs.get("main")!;
      return {
        sha: commitSha,
        defaultBranch: "main",
        entries: treeEntries(commits.get(commitSha)!.treeSha),
      };
    },
    readFile: async (_token, _remoteRef, _branch, path, blobSha) => {
      calls.push(`readFile:${path}`);
      if (onReadFile) await onReadFile(path);
      const bytes = blobs.get(blobSha);
      if (!bytes) throw { code: "RESOURCE_NOT_FOUND" };
      return new Uint8Array(bytes);
    },
  };
  const writer: GitHubPushWriter = {
    readHead: async () => {
      calls.push("readHead");
      const commitSha = refs.get("main")!;
      return { sha: commitSha, treeSha: commits.get(commitSha)!.treeSha };
    },
    writeBlob: async (_token, _remoteRef, bytes) => {
      const sha = gitSha(bytes);
      blobs.set(sha, Buffer.from(bytes));
      calls.push(`blob:${sha}`);
      return sha;
    },
    writeTree: async (_token, _remoteRef, baseTreeSha, entries) => {
      const next = new Map(trees.get(baseTreeSha) ?? []);
      for (const entry of entries) {
        if (entry.sha === null) next.delete(entry.path);
        else next.set(entry.path, entry.sha);
      }
      const sha = nextSha();
      trees.set(sha, next);
      calls.push(`tree:${sha}`);
      return sha;
    },
    writeCommit: async (_token, _remoteRef, treeSha, parentSha) => {
      const sha = nextSha();
      commits.set(sha, { treeSha, parent: parentSha });
      calls.push(`commit:${sha}`);
      return sha;
    },
    updateBranch: async (_token, _remoteRef, _branch, commitSha) => {
      calls.push("updateBranch");
      if (beforeUpdate) beforeUpdate();
      const commit = commits.get(commitSha)!;
      // GitHub rejects a non-fast-forward update rather than forcing the ref.
      if (refs.get("main") !== commit.parent) throw { code: "REMOTE_CONFLICT" };
      refs.set("main", commitSha);
    },
  };

  return {
    reader,
    writer,
    calls,
    seedBranch,
    externalAdvance,
    setRemote,
    head: () => refs.get("main")!,
    setBeforeUpdate: (fn: (() => void) | null) => {
      beforeUpdate = fn;
    },
    setOnReadFile: (fn: ((path: string) => Promise<void>) | null) => {
      onReadFile = fn;
    },
  };
}

describe("S12-T07 GitHub failure and concurrency cases", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let db: Awaited<ReturnType<typeof createSessionFixture>>["db"];
  let ownerId: string;
  let connectionId: string;
  let storage: S3StorageAdapter;
  let canonical: DefaultTextDocumentService;
  const invalidations: SyncInvalidationEvent[] = [];

  const decryptCredential = (ref: string) => decryptToken(ENCRYPTION_KEY, ref);

  const linkedProject = async (cursor: string) => {
    const project = await createProject(db, ownerId, {
      title: randomUUID(),
      compiler: "pdflatex",
    });
    await db.query(
      `INSERT INTO project_integrations
         (project_id, connection_id, provider, remote_ref, branch, sync_cursor)
       VALUES ($1, $2, 'github', 'octo/docs', 'main', $3)`,
      [project.id, connectionId, cursor],
    );
    const mainFileId = project.mainFileId;
    if (!mainFileId) throw new Error("createProject returned no main file");
    return { id: project.id, mainFileId };
  };

  const setMainText = async (projectId: string, fileId: string, text: string) => {
    const state = await canonical.load(projectId, fileId, ownerId);
    const update = buildReplacementUpdate(state.updateBase64, text);
    if (!update) return;
    await canonical.apply(projectId, fileId, ownerId, update);
  };

  const checkpoint = (projectId: string) =>
    new RevisionsRepository(db).createStructuralRevision({
      projectId,
      authorId: ownerId,
      source: "checkpoint",
    });

  const cursorOf = async (projectId: string) =>
    (
      await db.query<{ sync_cursor: string | null }>(
        "SELECT sync_cursor FROM project_integrations WHERE project_id = $1",
        [projectId],
      )
    ).rows[0]!.sync_cursor;

  const pushInput = (projectId: string, sourceRevisionId: string, expectedRemoteSha: string) => ({
    projectId,
    sourceRevisionId,
    actorUserId: ownerId,
    remoteRef: "octo/docs",
    expectedRemoteSha,
  });

  const pullService = (fake: ReturnType<typeof makeFakeGitHub>) =>
    createGitHubPullService({ db, reader: fake.reader, decryptCredential });

  const pushService = (fake: ReturnType<typeof makeFakeGitHub>) =>
    createGitHubPushService({ db, writer: fake.writer, storage, decryptCredential });

  const applyService = (fake: ReturnType<typeof makeFakeGitHub>) =>
    createGitHubApplyService({
      db,
      reader: fake.reader,
      decryptCredential,
      storage,
      canonicalText: canonical,
      invalidations: {
        publish: async (event) => {
          invalidations.push(event);
        },
      },
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
    const connection = await db.query<{ id: string }>(
      `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, 'github', $2, '["repo"]'::jsonb, 'active') RETURNING id`,
      [ownerId, encryptToken(ENCRYPTION_KEY, TEST_TOKEN)],
    );
    connectionId = connection.rows[0]!.id;
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    canonical = new DefaultTextDocumentService(db);
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it("pushes a frozen revision to the linked branch and pulls it back as synced", async () => {
    invalidations.length = 0;
    const fake = makeFakeGitHub();
    const cursor = fake.seedBranch("main");
    const { id: projectId, mainFileId } = await linkedProject(cursor);
    await setMainText(projectId, mainFileId, MAIN_V1);
    const revision = await checkpoint(projectId);

    const pushed = await pushService(fake).push(pushInput(projectId, revision.id, cursor));
    expect(pushed.status).toBe("synced");
    expect(fake.head()).toBe(pushed.remoteSha);
    expect(pushed.pushedPaths).toEqual(["main.tex"]);
    expect(pushed.sourceManifestHash).toBe(revision.manifestHash);
    expect(await cursorOf(projectId)).toBe(pushed.remoteSha);

    const plan = await pullService(fake).pull({
      actorUserId: ownerId,
      projectId,
      remoteRef: "octo/docs",
      expectedRemoteSha: pushed.remoteSha,
    });
    expect(plan.status).toBe("synced");
    expect(plan.conflicts).toEqual([]);
    expect(plan.remoteSha).toBe(pushed.remoteSha);
  });

  it("rejects a stale expected SHA before contacting the provider", async () => {
    const fake = makeFakeGitHub();
    const cursor = fake.seedBranch("main");
    const { id: projectId, mainFileId } = await linkedProject(cursor);
    await setMainText(projectId, mainFileId, MAIN_V1);
    const revision = await checkpoint(projectId);
    const service = pushService(fake);

    await service.push(pushInput(projectId, revision.id, cursor));
    fake.calls.length = 0;

    await expect(service.push(pushInput(projectId, revision.id, cursor))).rejects.toMatchObject({
      status: 409,
      code: "REMOTE_CONFLICT",
    });
    expect(fake.calls).toEqual([]);
  });

  it("rejects a non-fast-forward ref advance during push and never forces the ref", async () => {
    const fake = makeFakeGitHub();
    const cursor = fake.seedBranch("main");
    const { id: projectId, mainFileId } = await linkedProject(cursor);
    await setMainText(projectId, mainFileId, MAIN_V1);
    const revision = await checkpoint(projectId);

    let advanced = "";
    fake.setBeforeUpdate(() => {
      advanced = fake.externalAdvance();
    });
    await expect(
      pushService(fake).push(pushInput(projectId, revision.id, cursor)),
    ).rejects.toMatchObject({ status: 409, code: "REMOTE_CONFLICT" });

    expect(fake.head()).toBe(advanced);
    expect(await cursorOf(projectId)).toBe(cursor);
    const audit = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_events
       WHERE project_id = $1 AND action = 'github.push'`,
      [projectId],
    );
    expect(audit.rows[0]!.count).toBe("0");
  });

  it("never contact the provider or overwrite with an inactive credential", async () => {
    const fake = makeFakeGitHub();
    const cursor = fake.seedBranch("main");
    const { id: projectId, mainFileId } = await linkedProject(cursor);
    await setMainText(projectId, mainFileId, MAIN_V1);
    const revision = await checkpoint(projectId);
    await db.query("UPDATE external_connections SET status = 'revoked' WHERE id = $1", [
      connectionId,
    ]);
    try {
      fake.calls.length = 0;
      await expect(
        pushService(fake).push(pushInput(projectId, revision.id, cursor)),
      ).rejects.toMatchObject({ status: 401, code: "CREDENTIALS_MISSING" });
      await expect(
        applyService(fake).apply({
          actorUserId: ownerId,
          projectId,
          remoteRef: "octo/docs",
          expectedRemoteSha: cursor,
        }),
      ).rejects.toMatchObject({ status: 401, code: "CREDENTIALS_MISSING" });
      expect(fake.calls).toEqual([]);
      expect(await cursorOf(projectId)).toBe(cursor);
    } finally {
      await db.query("UPDATE external_connections SET status = 'active' WHERE id = $1", [
        connectionId,
      ]);
    }
  });

  it("reports a remote advance at status time as REMOTE_CONFLICT without a snapshot", async () => {
    const fake = makeFakeGitHub();
    const cursor = fake.seedBranch("main");
    const { id: projectId, mainFileId } = await linkedProject(cursor);
    await setMainText(projectId, mainFileId, MAIN_V1);
    fake.externalAdvance();

    await expect(
      pullService(fake).pull({
        actorUserId: ownerId,
        projectId,
        remoteRef: "octo/docs",
        expectedRemoteSha: cursor,
      }),
    ).rejects.toMatchObject({ status: 409, code: "REMOTE_CONFLICT" });

    const snapshots = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM project_revisions
       WHERE project_id = $1 AND source = 'github-pull'`,
      [projectId],
    );
    expect(snapshots.rows[0]!.count).toBe("0");
    expect(await cursorOf(projectId)).toBe(cursor);
  });

  it("aborts an apply when a local file is edited while remote bytes are fetched", async () => {
    invalidations.length = 0;
    const fake = makeFakeGitHub();
    const cursor = fake.seedBranch("main");
    const { id: projectId, mainFileId } = await linkedProject(cursor);
    await setMainText(projectId, mainFileId, MAIN_V1);

    const head = fake.setRemote(new Map([["main.tex", MAIN_V2]]));
    const base: SyncBaseManifest = {
      version: 1,
      remoteSha: head,
      entries: [
        {
          path: "main.tex",
          kind: "text",
          localFingerprint: fingerprintText(MAIN_V1),
          // A different remote SHA makes the remote side the changed side: the
          // classifier plans a safe update rather than a conflict.
          remoteSha: "a".repeat(40),
        },
      ],
    };
    await db.query(
      `UPDATE project_integrations SET sync_cursor = $2, sync_base_manifest = $3::jsonb
       WHERE project_id = $1`,
      [projectId, head, JSON.stringify(base)],
    );

    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waitPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake.setOnReadFile(async (path) => {
      if (path !== "main.tex") return;
      entered();
      await waitPromise;
    });

    const pending = applyService(fake).apply({
      actorUserId: ownerId,
      projectId,
      remoteRef: "octo/docs",
      expectedRemoteSha: head,
    });
    await enteredPromise;
    await setMainText(projectId, mainFileId, MAIN_CONCURRENT);
    fake.setOnReadFile(null);
    release();

    await expect(pending).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });

    const live = await db.query<{ payload_bytes: Buffer }>(
      "SELECT payload_bytes FROM crdt_updates WHERE file_id = $1 ORDER BY seq ASC",
      [mainFileId],
    );
    // The concurrent local edit survives: canonical text is not overwritten back.
    const doc = new Y.Doc();
    try {
      for (const row of live.rows) Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
      expect(doc.getText("content").toString()).toBe(MAIN_CONCURRENT);
    } finally {
      doc.destroy();
    }
    const post = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM project_revisions
       WHERE project_id = $1 AND label = 'Post-pull state'`,
      [projectId],
    );
    expect(post.rows[0]!.count).toBe("0");
    expect(invalidations).toEqual([]);
    expect(await cursorOf(projectId)).toBe(head);
  });
});
