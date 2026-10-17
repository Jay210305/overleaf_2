import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { deflateSync } from "node:zlib";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { AuthError } from "../../apps/api/src/modules/auth/errors.js";
import { decryptToken, encryptToken } from "../../apps/api/src/modules/integrations/github-auth.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { DefaultTextDocumentService } from "../../apps/api/src/modules/text/text-document-service.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import {
  buildReplacementUpdate,
  createGitHubApplyService,
  type CanonicalTextPort,
  type GitHubApplyReader,
  type SyncInvalidationEvent,
} from "../../apps/jobs/src/sync/apply-changes.js";
import {
  GitHubPullError,
  fingerprintBinary,
  fingerprintText,
  localFilesFromRevision,
  type RemoteTree,
  type RemoteTreeEntry,
  type SyncBaseManifest,
} from "../../apps/jobs/src/sync/github-pull.js";
import { createSessionFixture } from "../helpers/s02-session.js";
import { crc32, minimalPng, sha256Hex } from "../helpers/zip-fixtures.js";

loadEnvFile(".env");

const ENCRYPTION_KEY = "test-encryption-key-min-16-chars!!";
const TEST_TOKEN = "gho_s12_t08_token";
const MAIN_V1 = "\\documentclass{article}\n\\begin{document}\nLocal main\n\\end{document}\n";
const MAIN_V2 =
  "\\documentclass{article}\n\\begin{document}\nPulled from GitHub\n\\end{document}\n";
const MAIN_CONCURRENT =
  "\\documentclass{article}\n\\begin{document}\nConcurrent edit\n\\end{document}\n";
const NOTES = "\\section{Notes}\nKeep me in sync.\n";
const BIB = "@article{ref1, title={Remote}}\n";
const INTRO = "\\section{Intro}\nHello from the remote repository.\n";
const SECOND_V1 = "\\section{Second}\nLocal second\n";

const sha = (c: string) => c.repeat(40);
const remoteFile = (path: string, shaValue: string, sizeBytes: number): RemoteTreeEntry => ({
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

/** Minimal valid PNG with a chosen red channel so fixtures differ per test. */
function pngWithRed(red: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (data: Buffer, type: string): Buffer => {
    const typeBytes = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])) >>> 0, 0);
    return Buffer.concat([length, typeBytes, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = deflateSync(Buffer.from([0, red, 0, 0]));
  return Buffer.concat([
    signature,
    chunk(ihdr, "IHDR"),
    chunk(idat, "IDAT"),
    chunk(Buffer.alloc(0), "IEND"),
  ]);
}

describe("S12-T08 apply remote changes through the live canonical service", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let db: Awaited<ReturnType<typeof createSessionFixture>>["db"];
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let strangerId: string;
  let connectionId: string;
  let storage: S3StorageAdapter;
  let canonical: DefaultTextDocumentService;
  let service: ReturnType<typeof createGitHubApplyService>;
  let tree: RemoteTree;
  const files = new Map<string, Buffer>();
  const invalidations: SyncInvalidationEvent[] = [];
  const writtenKeys: string[] = [];
  const createdProjects: string[] = [];
  let publisherFails = false;
  let readerFailure: { path: string; code: string } | null = null;
  let readerGate: { path: string; entered: () => void; wait: Promise<void> } | null = null;
  const textDocs = new Map<string, Y.Doc>();

  const providerError = (code: string) => Object.assign(new Error(`provider ${code}`), { code });

  const reader: GitHubApplyReader = {
    readTree: async () => tree,
    readFile: async (_token, _remoteRef, _branch, path, _sha) => {
      if (readerGate && readerGate.path === path) {
        readerGate.entered();
        await readerGate.wait;
      }
      if (readerFailure && readerFailure.path === path) throw providerError(readerFailure.code);
      const bytes = files.get(path);
      if (!bytes) throw providerError("RESOURCE_NOT_FOUND");
      return new Uint8Array(bytes);
    },
  };

  const rejects = async (promise: Promise<unknown>, status: number, code: string) => {
    try {
      await promise;
      throw new Error("expected the apply to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubPullError);
      const pullError = error as GitHubPullError;
      expect(pullError.status).toBe(status);
      expect(pullError.code).toBe(code);
    }
  };

  const postRevisionCount = async (projectId: string) =>
    Number(
      (
        await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM project_revisions
           WHERE project_id = $1 AND label = 'Post-pull state'`,
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

  const integrationRow = async (projectId: string) =>
    (
      await db.query<{
        sync_cursor: string | null;
        last_synced_revision: string | null;
        sync_base_manifest: SyncBaseManifest | null;
      }>(
        `SELECT sync_cursor, last_synced_revision, sync_base_manifest
         FROM project_integrations WHERE project_id = $1`,
        [projectId],
      )
    ).rows[0]!;

  const linkedProject = async (
    title: string,
    options: { cursor?: string } = {},
  ): Promise<{ id: string; mainFileId: string }> => {
    const project = await createProject(db, ownerId, { title, compiler: "pdflatex" });
    await db.query(
      `INSERT INTO project_integrations
         (project_id, connection_id, provider, remote_ref, branch, sync_cursor)
       VALUES ($1, $2, 'github', 'octo/docs', 'main', $3)`,
      [project.id, connectionId, options.cursor ?? sha("1")],
    );
    createdProjects.push(project.id);
    const mainFileId = project.mainFileId;
    if (!mainFileId) throw new Error("createProject returned no main file");
    return { id: project.id, mainFileId };
  };

  const setBase = async (projectId: string, base: SyncBaseManifest) => {
    await db.query(
      "UPDATE project_integrations SET sync_base_manifest = $2::jsonb WHERE project_id = $1",
      [projectId, JSON.stringify(base)],
    );
  };

  const baseManifest = (
    entries: Array<{
      path: string;
      kind?: "text" | "binary";
      localFingerprint: string;
      remoteSha: string | null;
    }>,
    remoteSha = sha("1"),
  ): SyncBaseManifest => ({
    version: 1,
    remoteSha,
    entries: entries.map((entry) => ({ kind: "text" as const, ...entry })),
  });

  const writeText = async (nodeId: string, previous: string | null, next: string, seq: number) => {
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

  const seedText = async (projectId: string, name: string, content: string) => {
    const nodeId = randomUUID();
    await db.query(
      `INSERT INTO project_nodes
         (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
       VALUES ($1, $2, NULL, $3, 'FILE', 'application/x-tex', 'TEXT', $4)`,
      [nodeId, projectId, name, Buffer.byteLength(content)],
    );
    await db.query("INSERT INTO text_documents (file_id, project_id) VALUES ($1, $2)", [
      nodeId,
      projectId,
    ]);
    await writeText(nodeId, null, content, 1);
    return { nodeId };
  };

  const seedBinary = async (projectId: string, name: string, bytes: Uint8Array) => {
    const hash = sha256Hex(bytes);
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

  const replayText = async (fileId: string) => {
    const rows = await db.query<{ payload_bytes: Buffer }>(
      "SELECT payload_bytes FROM crdt_updates WHERE file_id = $1 ORDER BY seq ASC",
      [fileId],
    );
    const doc = new Y.Doc();
    try {
      for (const row of rows.rows) Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
      return doc.getText("content").toString();
    } finally {
      doc.destroy();
    }
  };

  const nodeByName = async (projectId: string, name: string) =>
    (
      await db.query<{
        id: string;
        parent_id: string | null;
        name: string;
        kind: string;
        mime: string;
        content_kind: string;
        size_bytes: string;
        blob_key: string | null;
        deleted_at: Date | null;
      }>(
        `SELECT id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key, deleted_at
         FROM project_nodes WHERE project_id = $1 AND name = $2
         ORDER BY (deleted_at IS NULL) DESC LIMIT 1`,
        [projectId, name],
      )
    ).rows[0]!;

  const apply = (projectId: string, actorUserId: string, overrides: Record<string, unknown> = {}) =>
    service.apply({
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
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    const storageSpy = Object.create(storage) as S3StorageAdapter;
    storageSpy.put = async (key, bytes, mime) => {
      writtenKeys.push(key);
      return storage.put(key, bytes, mime);
    };
    canonical = new DefaultTextDocumentService(db);
    service = createGitHubApplyService({
      db,
      reader,
      decryptCredential: (ref) => decryptToken(ENCRYPTION_KEY, ref),
      storage: storageSpy,
      canonicalText: canonical,
      invalidations: {
        publish: async (event) => {
          if (publisherFails) throw new Error("invalidation channel unavailable");
          invalidations.push(event);
        },
      },
    });
  });

  afterAll(async () => {
    for (const key of writtenKeys) {
      try {
        await storage.delete(key);
      } catch {
        // Best-effort cleanup of local MinIO fixtures.
      }
    }
    if (fixture) await fixture.close();
  });

  it("applies adds, updates and deletes through the canonical service with metadata preserved", async () => {
    invalidations.length = 0;
    publisherFails = false;
    files.clear();
    const oldChart = minimalPng();
    const newChart = pngWithRed(90);
    const logo = pngWithRed(180);
    const { id: projectId, mainFileId } = await linkedProject("Full apply");
    await writeText(mainFileId, null, MAIN_V1, 1);
    const notes = await seedText(projectId, "notes.tex", NOTES);
    await seedText(projectId, "refs.bib", BIB);
    const chart = await seedBinary(projectId, "chart.png", oldChart);
    await setBase(
      projectId,
      baseManifest([
        {
          path: "main.tex",
          localFingerprint: fingerprintText(MAIN_V1),
          remoteSha: sha("a"),
        },
        {
          path: "notes.tex",
          localFingerprint: fingerprintText(NOTES),
          remoteSha: sha("b"),
        },
        {
          path: "refs.bib",
          localFingerprint: fingerprintText(BIB),
          remoteSha: sha("c"),
        },
        {
          path: "chart.png",
          kind: "binary",
          localFingerprint: fingerprintBinary(chart.key),
          remoteSha: sha("d"),
        },
      ]),
    );

    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [
        remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V2)),
        remoteFile("refs.bib", sha("c"), Buffer.byteLength(BIB)),
        remoteFile("chart.png", sha("f"), newChart.length),
        remoteFile("chapters/intro.tex", sha("0"), Buffer.byteLength(INTRO)),
        remoteFile("assets/logo.png", sha("3"), logo.length),
        remoteFolder("chapters"),
        remoteFolder("assets"),
      ],
    };
    files.set("main.tex", Buffer.from(MAIN_V2));
    files.set("chapters/intro.tex", Buffer.from(INTRO));
    files.set("chart.png", newChart);
    files.set("assets/logo.png", logo);

    const result = await apply(projectId, ownerId);

    expect(result.status).toBe("applied");
    expect(result.appliedPaths).toEqual([
      "assets/logo.png",
      "chapters/intro.tex",
      "chart.png",
      "main.tex",
      "notes.tex",
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.detachedAnchorIds).toEqual([]);
    expect(result.conflictedSuggestionIds).toEqual([]);
    expect(result.revisionNo).toBeGreaterThan(result.preRevisionNo);
    expect(JSON.stringify(result)).not.toContain(TEST_TOKEN);

    // Canonical text of the updated file now matches the remote content.
    expect(await replayText(mainFileId)).toBe(MAIN_V2);
    const mainNode = await nodeByName(projectId, "main.tex");
    expect(mainNode.id).toBe(mainFileId);
    expect(mainNode.parent_id).toBeNull();
    expect(mainNode.kind).toBe("FILE");
    expect(mainNode.content_kind).toBe("TEXT");
    expect(Number(mainNode.size_bytes)).toBe(Buffer.byteLength(MAIN_V2));

    // Added text file lands under a created folder with canonical content.
    const introNode = await nodeByName(projectId, "intro.tex");
    expect(introNode.content_kind).toBe("TEXT");
    expect(introNode.mime).toBe("application/x-tex");
    const chapters = await nodeByName(projectId, "chapters");
    expect(chapters.kind).toBe("FOLDER");
    expect(introNode.parent_id).toBe(chapters.id);
    expect(await replayText(introNode.id)).toBe(INTRO);

    // Added binary file is stored under the content-addressed blob key.
    const logoNode = await nodeByName(projectId, "logo.png");
    const logoKey = `projects/${projectId}/blobs/${sha256Hex(logo)}`;
    expect(logoNode.content_kind).toBe("BINARY");
    expect(logoNode.mime).toBe("image/png");
    expect(logoNode.blob_key).toBe(logoKey);
    expect(Buffer.from(await storage.get(logoKey))).toEqual(logo);

    // Binary update preserves the node identity and replaces the blob.
    const chartNode = await nodeByName(projectId, "chart.png");
    expect(chartNode.id).toBe(chart.nodeId);
    expect(chartNode.blob_key).toBe(`projects/${projectId}/blobs/${sha256Hex(newChart)}`);
    expect(Buffer.from(await storage.get(chartNode.blob_key!))).toEqual(newChart);

    // Deleted file is soft-deleted; its history is preserved.
    const notesNode = await nodeByName(projectId, "notes.tex");
    expect(notesNode.id).toBe(notes.nodeId);
    expect(notesNode.deleted_at).not.toBeNull();

    // Post-apply revision freezes the new state and becomes the project revision.
    const postRevision = (
      await db.query<{ id: string; revision_no: string; source: string }>(
        `SELECT id, revision_no, source FROM project_revisions
         WHERE project_id = $1 AND label = 'Post-pull state'`,
        [projectId],
      )
    ).rows[0]!;
    expect(postRevision.id).toBe(result.revisionId);
    expect(Number(postRevision.revision_no)).toBe(result.revisionNo);
    expect(postRevision.source).toBe("github-pull");
    expect(await currentRevision(projectId)).toBe(result.revisionNo);

    // Agreement records the post-apply local fingerprints and the new cursor.
    const integration = await integrationRow(projectId);
    expect(integration.sync_cursor).toBe(sha("1"));
    expect(integration.last_synced_revision).toBe(String(result.revisionNo));
    const manifest = integration.sync_base_manifest!;
    expect(manifest.remoteSha).toBe(sha("1"));
    const byPath = new Map(manifest.entries.map((entry) => [entry.path, entry]));
    expect([...byPath.keys()].sort()).toEqual([
      "assets/logo.png",
      "chapters/intro.tex",
      "chart.png",
      "main.tex",
      "refs.bib",
    ]);
    expect(byPath.get("main.tex")).toEqual({
      path: "main.tex",
      kind: "text",
      localFingerprint: fingerprintText(MAIN_V2),
      remoteSha: sha("e"),
    });
    expect(byPath.get("chapters/intro.tex")).toEqual({
      path: "chapters/intro.tex",
      kind: "text",
      localFingerprint: fingerprintText(INTRO),
      remoteSha: sha("0"),
    });
    expect(byPath.get("chart.png")).toEqual({
      path: "chart.png",
      kind: "binary",
      localFingerprint: fingerprintBinary(chartNode.blob_key!),
      remoteSha: sha("f"),
    });
    expect(byPath.get("refs.bib")).toEqual({
      path: "refs.bib",
      kind: "text",
      localFingerprint: fingerprintText(BIB),
      remoteSha: sha("c"),
    });

    // Invalidations describe every applied file in path order; the text delta
    // converges a live replica doc seeded with the pre-pull state.
    expect(invalidations).toHaveLength(5);
    expect(invalidations.map((event) => event.fileId)).toEqual([
      logoNode.id,
      introNode.id,
      chartNode.id,
      mainFileId,
      notes.nodeId,
    ]);
    expect(invalidations[0]).toMatchObject({ type: "file_changed", updateBase64: null });
    expect(invalidations[1]).toMatchObject({ type: "file_changed" });
    expect(invalidations[1]!.updateBase64).not.toBeNull();
    expect(invalidations[2]).toMatchObject({ type: "file_changed", updateBase64: null });
    const mainEvent = invalidations[3]!;
    expect(mainEvent).toMatchObject({ type: "file_changed", fileId: mainFileId });
    expect(invalidations[4]).toMatchObject({ type: "file_deleted", fileId: notes.nodeId });
    const replica = new Y.Doc();
    try {
      Y.applyUpdate(replica, Y.encodeStateAsUpdate(textDocs.get(mainFileId)!));
      Y.applyUpdate(replica, Buffer.from(mainEvent.updateBase64!, "base64"));
      expect(replica.getText("content").toString()).toBe(MAIN_V2);
    } finally {
      replica.destroy();
    }
    expect(result.invalidationsEmitted).toBe(5);
    expect(result.invalidationsFailed).toBe(0);

    const before = await localFilesFromRevision(db, result.preRevisionId);
    expect(before.find((file) => file.path === "main.tex")?.fingerprint).toBe(
      fingerprintText(MAIN_V1),
    );
    const after = await localFilesFromRevision(db, result.revisionId);
    expect(after.find((file) => file.path === "main.tex")?.fingerprint).toBe(
      fingerprintText(MAIN_V2),
    );
    const state = await canonical.load(projectId, mainFileId, ownerId);
    const later = buildReplacementUpdate(state.updateBase64, MAIN_CONCURRENT);
    if (!later) throw new Error("expected a later edit");
    await canonical.apply(projectId, mainFileId, ownerId, later);
    expect(await localFilesFromRevision(db, result.revisionId)).toEqual(after);
  });

  it("detaches comment anchors and conflicts pending suggestions on changed files", async () => {
    invalidations.length = 0;
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Anchor detachment");
    await writeText(mainFileId, null, MAIN_V1, 1);
    await setBase(
      projectId,
      baseManifest([
        {
          path: "main.tex",
          localFingerprint: fingerprintText(MAIN_V1),
          remoteSha: sha("a"),
        },
      ]),
    );
    const comment = await db.query<{ id: string }>(
      `INSERT INTO comments
         (project_id, file_id, created_by, anchor_start_json, anchor_end_json, body, status)
       VALUES ($1, $2, $3, '{"rel":"start"}'::jsonb, '{"rel":"end"}'::jsonb, 'Please review', 'open')
       RETURNING id`,
      [projectId, mainFileId, ownerId],
    );
    const suggestion = await db.query<{ id: string }>(
      `INSERT INTO suggestions
         (project_id, file_id, author_id, kind, base_revision, anchor_json, old_text_hash, new_text, status)
       VALUES ($1, $2, $3, 'replace', '1', '{"rel":"start"}'::jsonb, 'hash', 'replacement', 'pending')
       RETURNING id`,
      [projectId, mainFileId, ownerId],
    );

    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V2))],
    };
    files.set("main.tex", Buffer.from(MAIN_V2));

    const result = await apply(projectId, ownerId);

    expect(result.detachedAnchorIds).toEqual([comment.rows[0]!.id]);
    expect(result.conflictedSuggestionIds).toEqual([suggestion.rows[0]!.id]);
    const commentRow = await db.query<{ status: string }>(
      "SELECT status FROM comments WHERE id = $1",
      [comment.rows[0]!.id],
    );
    expect(commentRow.rows[0]!.status).toBe("detached");
    const suggestionRow = await db.query<{ status: string }>(
      "SELECT status FROM suggestions WHERE id = $1",
      [suggestion.rows[0]!.id],
    );
    expect(suggestionRow.rows[0]!.status).toBe("conflict");
  });

  it("rejects unresolved conflicts without applying anything", async () => {
    invalidations.length = 0;
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Conservative conflict");
    await writeText(mainFileId, null, MAIN_V1, 1);
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V2))],
    };
    files.set("main.tex", Buffer.from(MAIN_V2));

    await rejects(apply(projectId, ownerId), 409, "REMOTE_CONFLICT");

    expect(await postRevisionCount(projectId)).toBe(0);
    expect(await replayText(mainFileId)).toBe(MAIN_V1);
    const integration = await integrationRow(projectId);
    expect(integration.sync_cursor).toBe(sha("1"));
    expect(integration.sync_base_manifest).toBeNull();
    expect(invalidations).toEqual([]);
  });

  it("authorizes owners and editors while hiding the integration from viewers and strangers", async () => {
    invalidations.length = 0;
    files.clear();
    const { id: projectId } = await linkedProject("Authorization");
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')",
      [projectId, editorId],
    );
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'VIEWER')",
      [projectId, viewerId],
    );
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("chapters/intro.tex", sha("0"), Buffer.byteLength(INTRO))],
    };
    files.set("chapters/intro.tex", Buffer.from(INTRO));

    await rejects(apply(projectId, viewerId), 404, "RESOURCE_NOT_FOUND");
    await rejects(apply(projectId, strangerId), 404, "RESOURCE_NOT_FOUND");
    const editorResult = await apply(projectId, editorId);
    expect(editorResult.status).toBe("applied");
    const introNode = await nodeByName(projectId, "intro.tex");
    expect(await replayText(introNode.id)).toBe(INTRO);
  });

  it("aborts with a conflict when a local file changes while remote bytes are fetched", async () => {
    invalidations.length = 0;
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Concurrent edit");
    await writeText(mainFileId, null, MAIN_V1, 1);
    const other = await seedText(projectId, "other.tex", SECOND_V1);
    await setBase(
      projectId,
      baseManifest([
        {
          path: "main.tex",
          localFingerprint: fingerprintText(MAIN_V1),
          remoteSha: sha("a"),
        },
        {
          path: "other.tex",
          localFingerprint: fingerprintText(SECOND_V1),
          remoteSha: sha("b"),
        },
      ]),
    );
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [
        remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V2)),
        remoteFile("other.tex", sha("f"), Buffer.byteLength(MAIN_V2)),
      ],
    };
    files.set("main.tex", Buffer.from(MAIN_V2));
    files.set("other.tex", Buffer.from(MAIN_V2));

    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waitPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    readerGate = { path: "main.tex", entered, wait: waitPromise };

    const pending = apply(projectId, ownerId);
    await enteredPromise;
    await writeText(mainFileId, MAIN_V1, MAIN_CONCURRENT, 2);
    readerGate = null;
    release();

    await rejects(pending, 409, "REVISION_CONFLICT");

    expect(await replayText(mainFileId)).toBe(MAIN_CONCURRENT);
    expect(await replayText(other.nodeId)).toBe(SECOND_V1);
    expect(await postRevisionCount(projectId)).toBe(0);
    expect(invalidations).toEqual([]);
  });

  it("maps provider failures while fetching remote bytes with local state intact", async () => {
    invalidations.length = 0;
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Provider failure");
    await writeText(mainFileId, null, MAIN_V1, 1);
    await setBase(
      projectId,
      baseManifest([
        {
          path: "main.tex",
          localFingerprint: fingerprintText(MAIN_V1),
          remoteSha: sha("a"),
        },
      ]),
    );
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V2))],
    };
    files.set("main.tex", Buffer.from(MAIN_V2));
    readerFailure = { path: "main.tex", code: "RATE_LIMITED" };

    await rejects(apply(projectId, ownerId), 429, "RATE_LIMITED");

    readerFailure = null;
    expect(await replayText(mainFileId)).toBe(MAIN_V1);
    expect(await postRevisionCount(projectId)).toBe(0);
    expect(invalidations).toEqual([]);
  });

  it("rolls back all entries when a later canonical mutation fails", async () => {
    invalidations.length = 0;
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Compensation");
    await writeText(mainFileId, null, MAIN_V1, 1);
    const second = await seedText(projectId, "second.tex", SECOND_V1);
    const base = baseManifest([
      {
        path: "main.tex",
        localFingerprint: fingerprintText(MAIN_V1),
        remoteSha: sha("a"),
      },
      {
        path: "second.tex",
        localFingerprint: fingerprintText(SECOND_V1),
        remoteSha: sha("b"),
      },
    ]);
    await setBase(projectId, base);
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [
        remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V2)),
        remoteFile("second.tex", sha("f"), Buffer.byteLength(MAIN_V2)),
      ],
    };
    files.set("main.tex", Buffer.from(MAIN_V2));
    files.set("second.tex", Buffer.from(MAIN_V2));

    let applyCalls = 0;
    const flaky: CanonicalTextPort = {
      load: (projectId2, fileId, actorId, tx) => canonical.load(projectId2, fileId, actorId, tx),
      apply: async (projectId2, fileId, actorId, input, tx) => {
        applyCalls += 1;
        if (applyCalls === 2) throw new AuthError(409, "REVISION_CONFLICT");
        return canonical.apply(projectId2, fileId, actorId, input, tx);
      },
    };
    const flakyService = createGitHubApplyService({
      db,
      reader,
      decryptCredential: (ref) => decryptToken(ENCRYPTION_KEY, ref),
      storage,
      canonicalText: flaky,
      invalidations: {
        publish: async (event) => {
          invalidations.push(event);
        },
      },
    });

    await rejects(
      flakyService.apply({
        actorUserId: ownerId,
        projectId,
        remoteRef: "octo/docs",
        expectedRemoteSha: tree.sha,
      }),
      409,
      "REVISION_CONFLICT",
    );

    expect(await replayText(mainFileId)).toBe(MAIN_V1);
    expect(await replayText(second.nodeId)).toBe(SECOND_V1);
    expect(await postRevisionCount(projectId)).toBe(0);
    const integration = await integrationRow(projectId);
    expect(integration.sync_base_manifest).toEqual(base);
    expect(integration.sync_cursor).toBe(sha("1"));
    expect(invalidations).toEqual([]);
  });

  it("rolls back before a waiting collaborator edit commits", async () => {
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Concurrent compensation");
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')",
      [projectId, editorId],
    );
    await writeText(mainFileId, null, MAIN_V1, 1);
    await seedText(projectId, "second.tex", SECOND_V1);
    await setBase(
      projectId,
      baseManifest([
        { path: "main.tex", localFingerprint: fingerprintText(MAIN_V1), remoteSha: sha("a") },
        { path: "second.tex", localFingerprint: fingerprintText(SECOND_V1), remoteSha: sha("b") },
      ]),
    );
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [
        remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V2)),
        remoteFile("second.tex", sha("f"), Buffer.byteLength(MAIN_V2)),
      ],
    };
    files.set("main.tex", Buffer.from(MAIN_V2));
    files.set("second.tex", Buffer.from(MAIN_V2));

    let applyCalls = 0;
    let concurrentEdit: Promise<void> | null = null;
    const concurrent: CanonicalTextPort = {
      load: (projectId2, fileId, actorId, tx) => canonical.load(projectId2, fileId, actorId, tx),
      apply: async (projectId2, fileId, actorId, input, tx) => {
        applyCalls += 1;
        if (applyCalls === 2) {
          concurrentEdit = (async () => {
            const state = await canonical.load(projectId2, mainFileId, editorId);
            const edit = buildReplacementUpdate(state.updateBase64, MAIN_CONCURRENT);
            if (!edit) throw new Error("expected a collaborator edit");
            await canonical.apply(projectId2, mainFileId, editorId, edit);
          })();
          throw new AuthError(409, "REVISION_CONFLICT");
        }
        return canonical.apply(projectId2, fileId, actorId, input, tx);
      },
    };
    const concurrentService = createGitHubApplyService({
      db,
      reader,
      decryptCredential: (ref) => decryptToken(ENCRYPTION_KEY, ref),
      storage,
      canonicalText: concurrent,
      invalidations: { publish: async () => {} },
    });

    await rejects(
      concurrentService.apply({
        actorUserId: ownerId,
        projectId,
        remoteRef: "octo/docs",
        expectedRemoteSha: tree.sha,
      }),
      409,
      "REVISION_CONFLICT",
    );
    if (!concurrentEdit) throw new Error("expected collaborator edit");
    await concurrentEdit;
    expect(await replayText(mainFileId)).toBe(MAIN_CONCURRENT);
    expect(await postRevisionCount(projectId)).toBe(0);
    expect((await integrationRow(projectId)).sync_cursor).toBe(sha("1"));
  });

  it("keeps committed state when invalidation delivery fails", async () => {
    invalidations.length = 0;
    publisherFails = true;
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Delivery failure");
    await writeText(mainFileId, null, MAIN_V1, 1);
    await setBase(
      projectId,
      baseManifest([
        {
          path: "main.tex",
          localFingerprint: fingerprintText(MAIN_V1),
          remoteSha: sha("a"),
        },
      ]),
    );
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V2))],
    };
    files.set("main.tex", Buffer.from(MAIN_V2));

    const result = await apply(projectId, ownerId);

    expect(result.status).toBe("applied");
    expect(result.invalidationsEmitted).toBe(0);
    expect(result.invalidationsFailed).toBe(1);
    expect(await replayText(mainFileId)).toBe(MAIN_V2);
    const integration = await integrationRow(projectId);
    expect(integration.sync_cursor).toBe(sha("1"));
    publisherFails = false;
  });

  it("records a clean pull without applying or publishing anything", async () => {
    invalidations.length = 0;
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Already synced");
    await writeText(mainFileId, null, MAIN_V1, 1);
    await setBase(
      projectId,
      baseManifest([
        {
          path: "main.tex",
          localFingerprint: fingerprintText(MAIN_V1),
          remoteSha: sha("e"),
        },
      ]),
    );
    tree = {
      sha: sha("1"),
      defaultBranch: "main",
      entries: [remoteFile("main.tex", sha("e"), Buffer.byteLength(MAIN_V1))],
    };

    const result = await apply(projectId, ownerId);

    expect(result.status).toBe("synced");
    expect(result.appliedPaths).toEqual([]);
    expect(result.revisionId).toBe(result.preRevisionId);
    expect(result.revisionNo).toBe(result.preRevisionNo);
    expect(await postRevisionCount(projectId)).toBe(0);
    expect(invalidations).toEqual([]);
    expect(await replayText(mainFileId)).toBe(MAIN_V1);
    const integration = await integrationRow(projectId);
    expect(integration.sync_cursor).toBe(sha("1"));
  });

  it("clears main_file_id when the remote deletes the main file", async () => {
    invalidations.length = 0;
    files.clear();
    const { id: projectId, mainFileId } = await linkedProject("Main deletion");
    await writeText(mainFileId, null, MAIN_V1, 1);
    await setBase(
      projectId,
      baseManifest([
        {
          path: "main.tex",
          localFingerprint: fingerprintText(MAIN_V1),
          remoteSha: sha("a"),
        },
      ]),
    );
    tree = { sha: sha("1"), defaultBranch: "main", entries: [] };

    const result = await apply(projectId, ownerId);

    expect(result.status).toBe("applied");
    expect(result.appliedPaths).toEqual(["main.tex"]);
    const mainRow = (
      await db.query<{ main_file_id: string | null }>(
        "SELECT main_file_id FROM projects WHERE id = $1",
        [projectId],
      )
    ).rows[0]!;
    expect(mainRow.main_file_id).toBeNull();
    const node = await nodeByName(projectId, "main.tex");
    expect(node.deleted_at).not.toBeNull();
  });
});
