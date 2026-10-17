import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { RevisionsRepository } from "@latex-collab/db";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { DefaultTextDocumentService } from "../../apps/api/src/modules/text/text-document-service.js";
import { decryptToken, encryptToken } from "../../apps/api/src/modules/integrations/github-auth.js";
import { buildReplacementUpdate } from "../../apps/jobs/src/sync/apply-changes.js";
import {
  createGitHubPushService,
  createGitHubRestPushWriter,
  type GitHubPushWriter,
} from "../../apps/jobs/src/sync/github-push.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createSessionFixture } from "../helpers/s02-session.js";
import { minimalPng } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");
const sha = (letter: string) => letter.repeat(40);
const KEY = "test-encryption-key-min-16-chars!!";
const CONTENT = "\\documentclass{article}\n\\begin{document}\nFrozen\n\\end{document}\n";

describe("S12-T04 guarded push of a frozen revision", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let ownerId: string;
  let viewerId: string;
  let connectionId: string;
  let storage: S3StorageAdapter;
  let canonical: DefaultTextDocumentService;
  const calls: string[] = [];
  let lastTreeEntries: Array<{ path: string; sha: string | null }> = [];
  let head = sha("1");
  let failure: string | null = null;
  const writer: GitHubPushWriter = {
    readHead: async () => {
      calls.push("readHead");
      if (failure) throw { code: failure };
      return { sha: head, treeSha: sha("2") };
    },
    writeBlob: async (_token, _repo, bytes) => {
      calls.push(`blob:${Buffer.from(bytes).toString("utf8")}`);
      return sha("a");
    },
    writeTree: async (_token, _repo, baseTreeSha, entries) => {
      lastTreeEntries = entries;
      calls.push(`tree:${baseTreeSha}:${entries.map((entry) => entry.path).join(",")}`);
      return sha("b");
    },
    writeCommit: async (_token, _repo, treeSha, parentSha) => {
      calls.push(`commit:${treeSha}:${parentSha}`);
      return sha("c");
    },
    updateBranch: async (_token, _repo, _branch, commitSha) => {
      calls.push(`update:${commitSha}`);
      if (failure) throw { code: failure };
      head = commitSha;
    },
  };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(80803)");
      await tx.query(
        readFileSync(
          resolve(import.meta.dirname, "../../packages/db/migrations/0013-github-sync-base.sql"),
          "utf8",
        ),
      );
    });
    ownerId = (await fixture.seed()).id;
    viewerId = (await fixture.seed()).id;
    const connection = await fixture.db.query<{ id: string }>(
      `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, 'github', $2, '["repo"]'::jsonb, 'active') RETURNING id`,
      [ownerId, encryptToken(KEY, "gho_test")],
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
    canonical = new DefaultTextDocumentService(fixture.db);
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  async function linkedRevision() {
    calls.length = 0;
    lastTreeEntries = [];
    head = sha("1");
    failure = null;
    const project = await createProject(fixture.db, ownerId, {
      title: randomUUID(),
      compiler: "pdflatex",
    });
    await fixture.db.query(
      `INSERT INTO project_integrations
         (project_id, connection_id, provider, remote_ref, branch, sync_cursor)
       VALUES ($1, $2, 'github', 'octo/docs', 'main', $3)`,
      [project.id, connectionId, head],
    );
    const mainFileId = project.mainFileId!;
    const state = await canonical.load(project.id, mainFileId, ownerId);
    const update = buildReplacementUpdate(state.updateBase64, CONTENT)!;
    await canonical.apply(project.id, mainFileId, ownerId, update);
    const revision = await new RevisionsRepository(fixture.db).createStructuralRevision({
      projectId: project.id,
      authorId: ownerId,
      source: "checkpoint",
    });
    return { projectId: project.id, mainFileId, revision };
  }
  const service = () =>
    createGitHubPushService({
      db: fixture.db,
      writer,
      storage,
      decryptCredential: (ref) => decryptToken(KEY, ref),
    });
  const input = (projectId: string, sourceRevisionId: string, actorUserId = ownerId) => ({
    projectId,
    sourceRevisionId,
    actorUserId,
    remoteRef: "octo/docs",
    expectedRemoteSha: sha("1"),
  });

  it("pushes exactly the frozen source and advances the cursor after a non-force update", async () => {
    const { projectId, mainFileId, revision } = await linkedRevision();
    const state = await canonical.load(projectId, mainFileId, ownerId);
    await canonical.apply(
      projectId,
      mainFileId,
      ownerId,
      buildReplacementUpdate(state.updateBase64, "later live edit")!,
    );
    const result = await service().push(input(projectId, revision.id));
    expect(result).toMatchObject({
      status: "synced",
      remoteSha: sha("c"),
      sourceRevisionId: revision.id,
      sourceManifestHash: revision.manifestHash,
      pushedPaths: ["main.tex"],
    });
    expect(calls).toEqual([
      "readHead",
      `blob:${CONTENT}`,
      `tree:${sha("2")}:main.tex`,
      `commit:${sha("b")}:${sha("1")}`,
      `update:${sha("c")}`,
    ]);
    const row = (
      await fixture.db.query<{
        sync_cursor: string;
        last_synced_revision: string;
        sync_base_manifest: { entries: unknown[] };
      }>(
        "SELECT sync_cursor, last_synced_revision, sync_base_manifest FROM project_integrations WHERE project_id = $1",
        [projectId],
      )
    ).rows[0]!;
    expect(row.sync_cursor).toBe(sha("c"));
    expect(row.last_synced_revision).toBe(String(revision.revisionNo));
    expect(row.sync_base_manifest.entries).toHaveLength(1);
  });

  it("rejects a moved branch before writing objects or changing the cursor", async () => {
    const { projectId, revision } = await linkedRevision();
    head = sha("d");
    await expect(service().push(input(projectId, revision.id))).rejects.toMatchObject({
      status: 409,
      code: "REMOTE_CONFLICT",
    });
    expect(calls).toEqual(["readHead"]);
    const row = (
      await fixture.db.query<{ sync_cursor: string }>(
        "SELECT sync_cursor FROM project_integrations WHERE project_id = $1",
        [projectId],
      )
    ).rows[0]!;
    expect(row.sync_cursor).toBe(sha("1"));
  });

  it("deletes only previously synced paths absent from the frozen source", async () => {
    const { projectId, revision } = await linkedRevision();
    await fixture.db.query(
      "UPDATE project_integrations SET sync_base_manifest = $2::jsonb WHERE project_id = $1",
      [
        projectId,
        JSON.stringify({
          version: 1,
          remoteSha: sha("1"),
          entries: [
            { path: "old.tex", kind: "text", localFingerprint: "old", remoteSha: sha("e") },
          ],
        }),
      ],
    );
    await service().push(input(projectId, revision.id));
    expect(lastTreeEntries).toEqual([
      { path: "main.tex", sha: sha("a") },
      { path: "old.tex", sha: null },
    ]);
  });

  it("pushes binary bytes from the frozen revision after the live node is deleted", async () => {
    const { projectId } = await linkedRevision();
    const bytes = minimalPng();
    const hash = createHash("sha256").update(bytes).digest("hex");
    const key = `projects/${projectId}/blobs/${hash}`;
    await storage.put(key, bytes, "image/png");
    const binaryId = randomUUID();
    await fixture.db.query(
      `INSERT INTO project_nodes
         (id, project_id, name, kind, mime, content_kind, size_bytes, blob_key)
       VALUES ($1, $2, 'chart.png', 'FILE', 'image/png', 'BINARY', $3, $4)`,
      [binaryId, projectId, bytes.length, key],
    );
    const revision = await new RevisionsRepository(fixture.db).createStructuralRevision({
      projectId,
      authorId: ownerId,
      source: "checkpoint",
    });
    await fixture.db.query("DELETE FROM project_nodes WHERE id = $1", [binaryId]);
    const result = await service().push(input(projectId, revision.id));
    expect(result.pushedPaths).toEqual(["chart.png", "main.tex"]);
    expect(calls).toContain(`tree:${sha("2")}:chart.png,main.tex`);
    await storage.delete(key);
  });

  it("does not fake sync on a ref race or expired token", async () => {
    const { projectId, revision } = await linkedRevision();
    failure = "REMOTE_CONFLICT";
    await expect(service().push(input(projectId, revision.id))).rejects.toMatchObject({
      status: 409,
      code: "REMOTE_CONFLICT",
    });
    failure = "TOKEN_EXPIRED";
    await expect(service().push(input(projectId, revision.id))).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_EXPIRED",
    });
    const cursor = (
      await fixture.db.query<{ sync_cursor: string }>(
        "SELECT sync_cursor FROM project_integrations WHERE project_id = $1",
        [projectId],
      )
    ).rows[0]!.sync_cursor;
    expect(cursor).toBe(sha("1"));
  });

  it("denies a viewer and a foreign revision before any provider action", async () => {
    const first = await linkedRevision();
    const second = await linkedRevision();
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [first.projectId, viewerId],
    );
    calls.length = 0;
    await expect(
      service().push(input(first.projectId, first.revision.id, viewerId)),
    ).rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND" });
    await expect(service().push(input(first.projectId, second.revision.id))).rejects.toMatchObject({
      status: 404,
      code: "RESOURCE_NOT_FOUND",
    });
    expect(calls).toEqual([]);
  });

  it("rejects a revision item that no longer matches its manifest hash", async () => {
    const { projectId, revision } = await linkedRevision();
    await fixture.db.query(
      "UPDATE revision_items SET text_bytes = $2 WHERE revision_id = $1 AND path = 'main.tex'",
      [revision.id, Buffer.from("tampered")],
    );
    await expect(service().push(input(projectId, revision.id))).rejects.toMatchObject({
      status: 409,
      code: "REVISION_CONFLICT",
    });
    expect(calls).toEqual([]);
  });

  it("sends force:false to GitHub's reference endpoint", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({ object: { sha: sha("c") } }), { status: 200 });
    };
    await createGitHubRestPushWriter(fetchMock as typeof fetch).updateBranch(
      "token",
      "octo/docs",
      "main",
      sha("c"),
    );
    expect(requests).toEqual([
      {
        url: "https://api.github.com/repos/octo/docs/git/refs/heads/main",
        method: "PATCH",
        body: { sha: sha("c"), force: false },
      },
    ]);
  });

  it("bases the new tree on the verified remote tree", async () => {
    let body: Record<string, unknown> | undefined;
    const request = async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ sha: sha("b") }), { status: 201 });
    };
    await createGitHubRestPushWriter(request as typeof fetch).writeTree(
      "token",
      "octo/docs",
      sha("2"),
      [{ path: "main.tex", sha: sha("a") }],
    );
    expect(body).toEqual({
      base_tree: sha("2"),
      tree: [{ path: "main.tex", mode: "100644", type: "blob", sha: sha("a") }],
    });
  });
});
