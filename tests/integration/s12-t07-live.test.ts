import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { RevisionsRepository } from "@latex-collab/db";
import { decryptToken, encryptToken } from "../../apps/api/src/modules/integrations/github-auth.js";
import { createGitHubRestReader } from "../../apps/api/src/modules/integrations/github-rest.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { DefaultTextDocumentService } from "../../apps/api/src/modules/text/text-document-service.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import {
  buildReplacementUpdate,
  createGitHubApplyService,
  type GitHubApplyReader,
} from "../../apps/jobs/src/sync/apply-changes.js";
import {
  createGitHubPushService,
  createGitHubRestPushWriter,
} from "../../apps/jobs/src/sync/github-push.js";
import { createSessionFixture } from "../helpers/s02-session.js";

loadEnvFile(".env");
if (existsSync(".env.github-test")) loadEnvFile(".env.github-test");

/**
 * S12-T07 credentialed acceptance (INT-05).
 *
 * Opt-in live proof against a real, disposable GitHub repository. It is skipped
 * unless all of these are present in the environment (or `.env.github-test`,
 * which is gitignored):
 *
 *   GITHUB_LIVE_TOKEN   fine-grained/PAT token with Contents: read+write
 *   GITHUB_LIVE_REPO    owner/name of the disposable test repository
 *   GITHUB_LIVE_BRANCH  existing non-default scratch branch (e.g. s12-t07-live)
 *
 * The token is never printed. Run only with:
 *   pnpm exec vitest run tests/integration/s12-t07-live.test.ts --coverage.enabled=false
 */

const TOKEN = process.env.GITHUB_LIVE_TOKEN ?? "";
const REPO = process.env.GITHUB_LIVE_REPO ?? "";
const BRANCH = process.env.GITHUB_LIVE_BRANCH ?? "";
const ALLOW_DEFAULT = process.env.GITHUB_LIVE_ALLOW_DEFAULT === "1";

const LIVE =
  TOKEN.length > 0 &&
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO) &&
  /^[A-Za-z0-9._/-]+$/.test(BRANCH) &&
  !BRANCH.includes("..") &&
  !BRANCH.includes("//") &&
  (ALLOW_DEFAULT || (BRANCH !== "main" && BRANCH !== "master"));

const ENCRYPTION_KEY = "live-encryption-key-min-16-chars!!!";
const MAIN_PATH = "main.tex";
const MAIN_V1 = "\\documentclass{article}\n\\begin{document}\nLive push T07\n\\end{document}\n";
const MAIN_V2 = "\\documentclass{article}\n\\begin{document}\nLive remote T07\n\\end{document}\n";
const MAIN_CONCURRENT =
  "\\documentclass{article}\n\\begin{document}\nLive concurrent T07\n\\end{document}\n";

if (
  !LIVE &&
  (TOKEN.length > 0 ||
    REPO.length > 0 ||
    BRANCH.length > 0 ||
    process.env.GITHUB_LIVE_TOKEN !== undefined)
) {
  console.warn(
    "[s12-t07-live] skipped: set GITHUB_LIVE_TOKEN, GITHUB_LIVE_REPO (owner/name) and a non-default GITHUB_LIVE_BRANCH; use GITHUB_LIVE_ALLOW_DEFAULT=1 only for a disposable default branch.",
  );
}

describe.skipIf(!LIVE)("S12-T07 credentialed GitHub acceptance (live)", () => {
  vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let db: Awaited<ReturnType<typeof createSessionFixture>>["db"];
  let ownerId: string;
  let connectionId: string;
  let storage: S3StorageAdapter;
  let canonical: DefaultTextDocumentService;
  let writer: ReturnType<typeof createGitHubRestPushWriter>;
  let reader: ReturnType<typeof createGitHubRestReader>;

  const decryptCredential = (ref: string) => decryptToken(ENCRYPTION_KEY, ref);

  const remoteHead = () => writer.readHead(TOKEN, REPO, BRANCH);

  const remoteText = async (): Promise<string> => {
    const tree = await reader.readTree(TOKEN, REPO, BRANCH);
    const entry = tree.entries.find((item) => item.path === MAIN_PATH && item.kind === "file");
    if (!entry || !entry.sha) throw new Error(`Remote ${MAIN_PATH} is missing on ${BRANCH}`);
    const bytes = await reader.readFile(TOKEN, REPO, BRANCH, MAIN_PATH, entry.sha);
    return Buffer.from(bytes).toString("utf8");
  };

  /** Advance the scratch branch out of band, as a collaborator's push would. */
  const commitFile = async (
    path: string,
    content: string,
    head: { sha: string; treeSha: string },
  ): Promise<string> => {
    const blob = await writer.writeBlob(TOKEN, REPO, Buffer.from(content, "utf8"));
    const tree = await writer.writeTree(TOKEN, REPO, head.treeSha, [{ path, sha: blob }]);
    const commit = await writer.writeCommit(TOKEN, REPO, tree, head.sha, `s12-t07 live ${path}`);
    await writer.updateBranch(TOKEN, REPO, BRANCH, commit);
    return commit;
  };

  const createLinkedProject = async (cursor: string, connection = connectionId) => {
    const project = await createProject(db, ownerId, {
      title: randomUUID(),
      compiler: "pdflatex",
    });
    const mainFileId = project.mainFileId;
    if (!mainFileId) throw new Error("createProject returned no main file");
    await db.query(
      `INSERT INTO project_integrations
         (project_id, connection_id, provider, remote_ref, branch, sync_cursor)
       VALUES ($1, $2, 'github', $3, $4, $5)`,
      [project.id, connection, REPO, BRANCH, cursor],
    );
    return { id: project.id, mainFileId };
  };

  const setMainText = async (projectId: string, fileId: string, text: string) => {
    const state = await canonical.load(projectId, fileId, ownerId);
    const update = buildReplacementUpdate(state.updateBase64, text);
    if (!update) return;
    await canonical.apply(projectId, fileId, ownerId, update);
  };

  const localText = async (projectId: string, fileId: string): Promise<string> => {
    const state = await canonical.load(projectId, fileId, ownerId);
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Buffer.from(state.updateBase64, "base64"));
      return doc.getText("content").toString();
    } finally {
      doc.destroy();
    }
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

  /**
   * Record an observed remote head as the integration cursor. A real remote
   * advance is surfaced as REMOTE_CONFLICT by status/pull; this stands in for
   * the reconciliation step that records the head before an explicit pull.
   */
  const recordObservedHead = async (projectId: string, head: string) => {
    await db.query("UPDATE project_integrations SET sync_cursor = $2 WHERE project_id = $1", [
      projectId,
      head,
    ]);
  };

  const pushInput = (projectId: string, sourceRevisionId: string, expectedRemoteSha: string) => ({
    projectId,
    sourceRevisionId,
    actorUserId: ownerId,
    remoteRef: REPO,
    expectedRemoteSha,
  });

  const pushService = () => createGitHubPushService({ db, writer, storage, decryptCredential });

  const applyService = (applyReader: GitHubApplyReader = reader) =>
    createGitHubApplyService({
      db,
      reader: applyReader,
      decryptCredential,
      storage,
      canonicalText: canonical,
      invalidations: { publish: async () => undefined },
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
      [ownerId, encryptToken(ENCRYPTION_KEY, TOKEN)],
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
    writer = createGitHubRestPushWriter();
    reader = createGitHubRestReader();
    const head = await remoteHead();
    if (!head || !/^[a-f0-9]{40}$/.test(head.sha))
      throw new Error(
        `Scratch branch ${BRANCH} is not readable in ${REPO}. Create it from the default branch first.`,
      );
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it("pushes a frozen revision to the real branch and pulls a remote commit back", async () => {
    const head0 = await remoteHead();
    const { id, mainFileId } = await createLinkedProject(head0.sha);
    await setMainText(id, mainFileId, MAIN_V1);
    const revision = await checkpoint(id);

    const pushed = await pushService().push(pushInput(id, revision.id, head0.sha));
    expect(pushed.status).toBe("synced");
    expect(pushed.pushedPaths).toEqual([MAIN_PATH]);
    expect(await remoteText()).toBe(MAIN_V1);
    expect((await remoteHead()).sha).toBe(pushed.remoteSha);
    expect(await cursorOf(id)).toBe(pushed.remoteSha);

    await commitFile(MAIN_PATH, MAIN_V2, await remoteHead());
    const head1 = (await remoteHead()).sha;
    console.log(`[s12-t07-live] pushed ${pushed.remoteSha}; remote advance ${head1}`);
    await recordObservedHead(id, head1);
    const applied = await applyService().apply({
      actorUserId: ownerId,
      projectId: id,
      remoteRef: REPO,
      expectedRemoteSha: head1,
    });
    expect(applied.status).toBe("applied");
    expect(applied.remoteSha).toBe(head1);
    expect(applied.conflicts).toEqual([]);
    expect(await localText(id, mainFileId)).toBe(MAIN_V2);
  });

  it("rejects a non-fast-forward advance without forcing the real ref", async () => {
    const head0 = await remoteHead();
    const { id, mainFileId } = await createLinkedProject(head0.sha);
    await setMainText(id, mainFileId, MAIN_V1);
    const revision = await checkpoint(id);

    await commitFile(MAIN_PATH, `${MAIN_V1}% external advance\n`, head0);
    const advanced = (await remoteHead()).sha;
    expect(advanced).not.toBe(head0.sha);

    await expect(pushService().push(pushInput(id, revision.id, head0.sha))).rejects.toMatchObject({
      status: 409,
      code: "REMOTE_CONFLICT",
    });
    expect((await remoteHead()).sha).toBe(advanced);
    expect(await cursorOf(id)).toBe(head0.sha);
  });

  it("surfaces an invalid credential as TOKEN_EXPIRED without touching the ref", async () => {
    const head0 = await remoteHead();
    const invalid = await db.query<{ id: string }>(
      `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, 'github', $2, '["repo"]'::jsonb, 'active') RETURNING id`,
      [ownerId, encryptToken(ENCRYPTION_KEY, `gho_invalid_${randomUUID()}`)],
    );
    const { id, mainFileId } = await createLinkedProject(head0.sha, invalid.rows[0]!.id);
    await setMainText(id, mainFileId, MAIN_V1);
    const revision = await checkpoint(id);

    await expect(pushService().push(pushInput(id, revision.id, head0.sha))).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_EXPIRED",
    });
    expect((await remoteHead()).sha).toBe(head0.sha);
    expect(await cursorOf(id)).toBe(head0.sha);
  });

  it("aborts a live apply when the local file is edited while remote bytes are fetched", async () => {
    const head0 = await remoteHead();
    const { id, mainFileId } = await createLinkedProject(head0.sha);
    await setMainText(id, mainFileId, MAIN_V1);
    const revision = await checkpoint(id);

    await pushService().push(pushInput(id, revision.id, head0.sha));
    await commitFile(MAIN_PATH, MAIN_V2, await remoteHead());
    const head2 = (await remoteHead()).sha;
    console.log(`[s12-t07-live] concurrent-edit remote head ${head2}`);
    await recordObservedHead(id, head2);

    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolveEntered) => {
      entered = resolveEntered;
    });
    const releasePromise = new Promise<void>((resolveRelease) => {
      release = resolveRelease;
    });
    const gated: GitHubApplyReader = {
      readTree: (token, remoteRef, branch) => reader.readTree(token, remoteRef, branch),
      readFile: async (token, remoteRef, branch, path, sha) => {
        if (path === MAIN_PATH) {
          entered();
          await releasePromise;
        }
        return reader.readFile(token, remoteRef, branch, path, sha);
      },
    };

    const pending = applyService(gated).apply({
      actorUserId: ownerId,
      projectId: id,
      remoteRef: REPO,
      expectedRemoteSha: head2,
    });
    pending.catch(() => undefined);
    await enteredPromise;
    await setMainText(id, mainFileId, MAIN_CONCURRENT);
    release();

    await expect(pending).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect(await localText(id, mainFileId)).toBe(MAIN_CONCURRENT);
    expect((await remoteHead()).sha).toBe(head2);
    const post = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM project_revisions
       WHERE project_id = $1 AND label = 'Post-pull state'`,
      [id],
    );
    expect(post.rows[0]!.count).toBe("0");
  });
});
