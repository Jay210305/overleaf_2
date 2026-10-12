import { createHash, randomUUID } from "node:crypto";
import type { DatabaseClient, TransactionContext } from "../client.js";

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJsonStringify((obj as Record<string, unknown>)[key])}`,
  );
  return `{${entries.join(",")}}`;
}

export function computeSha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface ManifestItem {
  nodeId: string;
  path: string;
  kind: "TEXT" | "BINARY";
  object: {
    key: string;
    sha256: string;
    sizeBytes: number;
    mime: string;
  };
}

export interface RevisionManifest {
  version: 1;
  projectId: string;
  revisionId: string;
  revisionNo: number;
  mainFileId: string | null;
  compiler: string;
  texliveImageDigest: string;
  items: ManifestItem[];
}

export interface StructuralRevisionRecord {
  id: string;
  projectId: string;
  revisionNo: number;
  manifestKey: string;
  manifestHash: string;
  authorId: string | null;
  source: string;
  createdAt: string;
  label: string | null;
  manifest: RevisionManifest;
  items: Array<{
    nodeId: string;
    path: string;
    blobKey: string;
    sha256: string;
    deleted: boolean;
  }>;
}

export interface CreateRevisionParams {
  projectId: string;
  authorId?: string | null | undefined;
  source: string;
  label?: string | null | undefined;
}

export class RevisionsRepository {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Freezes current active file tree into an immutable project revision and manifest.
   */
  async createStructuralRevision(
    params: CreateRevisionParams,
    txContext?: TransactionContext,
  ): Promise<StructuralRevisionRecord> {
    const run = async (tx: TransactionContext): Promise<StructuralRevisionRecord> => {
      // 1. Lock project row
      const projRes = await tx.query<{
        id: string;
        main_file_id: string | null;
        compiler: string;
        texlive_image_version: string;
        current_revision: number;
      }>(
        `SELECT id, main_file_id, compiler, texlive_image_version, current_revision
         FROM projects
         WHERE id = $1 FOR UPDATE`,
        [params.projectId],
      );
      const proj = projRes.rows[0];
      if (!proj) {
        throw new Error(`Project ${params.projectId} not found`);
      }

      const currentRev = Number(proj.current_revision);
      const nextRevisionNo = currentRev + 1;
      const revisionId = randomUUID();

      // 2. Query all active nodes in the project
      const nodesRes = await tx.query<{
        id: string;
        parent_id: string | null;
        name: string;
        kind: "FILE" | "FOLDER";
        mime: string;
        content_kind: "TEXT" | "BINARY";
        size_bytes: number;
        blob_key: string | null;
      }>(
        `SELECT id, parent_id, name, kind, mime, content_kind, size_bytes, blob_key
         FROM project_nodes
         WHERE project_id = $1 AND deleted_at IS NULL`,
        [params.projectId],
      );

      const nodeMap = new Map(nodesRes.rows.map((n) => [n.id, n]));

      // 3. Compute canonical path for each node
      const getCanonicalPath = (nodeId: string): string => {
        const parts: string[] = [];
        let curr: string | null = nodeId;
        while (curr !== null) {
          const n = nodeMap.get(curr);
          if (!n) break;
          parts.unshift(n.name);
          curr = n.parent_id;
        }
        return parts.join("/");
      };

      // 4. For FILE nodes, construct manifest items
      const fileNodes = nodesRes.rows.filter((n) => n.kind === "FILE");
      const emptySha256 = computeSha256("");

      const manifestItems: ManifestItem[] = fileNodes.map((n) => {
        const path = getCanonicalPath(n.id);
        const itemSha256 = n.blob_key ? computeSha256(n.blob_key) : emptySha256;
        const blobKey = n.blob_key ?? `projects/${params.projectId}/blobs/${itemSha256}`;
        return {
          nodeId: n.id,
          path,
          kind: n.content_kind,
          object: {
            key: blobKey,
            sha256: itemSha256,
            sizeBytes: Number(n.size_bytes),
            mime: n.mime,
          },
        };
      });

      // 5. Canonical manifest sorting: sort by normalized path ASC, then nodeId ASC
      manifestItems.sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path);
        if (pathCmp !== 0) return pathCmp;
        return a.nodeId.localeCompare(b.nodeId);
      });

      const manifest: RevisionManifest = {
        version: 1,
        projectId: params.projectId,
        revisionId,
        revisionNo: nextRevisionNo,
        mainFileId: proj.main_file_id,
        compiler: proj.compiler,
        texliveImageDigest: proj.texlive_image_version,
        items: manifestItems,
      };

      const manifestJson = canonicalJsonStringify(manifest);
      const manifestHash = computeSha256(manifestJson);
      const manifestKey = `projects/${params.projectId}/revisions/${nextRevisionNo}.json`;

      // 6. Insert project_revisions
      const insertRevRes = await tx.query<{
        id: string;
        created_at: Date;
      }>(
        `INSERT INTO project_revisions (
           id, project_id, revision_no, manifest_key, manifest_hash,
           author_id, source, label
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, created_at`,
        [
          revisionId,
          params.projectId,
          nextRevisionNo,
          manifestKey,
          manifestHash,
          params.authorId ?? null,
          params.source,
          params.label ?? null,
        ],
      );
      const createdAt = insertRevRes.rows[0]!.created_at.toISOString();

      // 7. Insert revision_items
      for (const item of manifestItems) {
        await tx.query(
          `INSERT INTO revision_items (revision_id, node_id, path, blob_key, sha256, deleted)
           VALUES ($1, $2, $3, $4, $5, false)`,
          [
            revisionId,
            item.nodeId,
            item.path,
            item.object.key,
            item.object.sha256,
          ],
        );
      }

      // 8. Monotonically increment current_revision on projects
      await tx.query(
        `UPDATE projects
         SET current_revision = $1, updated_at = now()
         WHERE id = $2`,
        [nextRevisionNo, params.projectId],
      );

      const record: StructuralRevisionRecord = {
        id: revisionId,
        projectId: params.projectId,
        revisionNo: nextRevisionNo,
        manifestKey,
        manifestHash,
        authorId: params.authorId ?? null,
        source: params.source,
        createdAt,
        label: params.label ?? null,
        manifest,
        items: manifestItems.map((i) => ({
          nodeId: i.nodeId,
          path: i.path,
          blobKey: i.object.key,
          sha256: i.object.sha256,
          deleted: false,
        })),
      };

      return record;
    };

    if (txContext) {
      return run(txContext);
    }
    return this.db.transaction(run);
  }

  /**
   * Retrieves revision by project ID and revision number.
   */
  async getRevision(projectId: string, revisionNo: number): Promise<StructuralRevisionRecord | null> {
    const revRes = await this.db.query<{
      id: string;
      project_id: string;
      revision_no: number;
      manifest_key: string;
      manifest_hash: string;
      author_id: string | null;
      source: string;
      label: string | null;
      created_at: Date;
    }>(
      `SELECT id, project_id, revision_no, manifest_key, manifest_hash, author_id, source, label, created_at
       FROM project_revisions
       WHERE project_id = $1 AND revision_no = $2`,
      [projectId, revisionNo],
    );
    const rev = revRes.rows[0];
    if (!rev) return null;

    const itemsRes = await this.db.query<{
      node_id: string;
      path: string;
      blob_key: string;
      sha256: string;
      deleted: boolean;
    }>(
      `SELECT node_id, path, blob_key, sha256, deleted
       FROM revision_items
       WHERE revision_id = $1
       ORDER BY path ASC, node_id ASC`,
      [rev.id],
    );

    const manifestItems: ManifestItem[] = itemsRes.rows.map((r) => ({
      nodeId: r.node_id,
      path: r.path,
      kind: r.path.endsWith(".tex") ? "TEXT" : "BINARY",
      object: {
        key: r.blob_key,
        sha256: r.sha256,
        sizeBytes: 0,
        mime: r.path.endsWith(".tex") ? "application/x-tex" : "application/octet-stream",
      },
    }));

    const manifest: RevisionManifest = {
      version: 1,
      projectId: rev.project_id,
      revisionId: rev.id,
      revisionNo: Number(rev.revision_no),
      mainFileId: null,
      compiler: "pdflatex",
      texliveImageDigest: "2024.1",
      items: manifestItems,
    };

    return {
      id: rev.id,
      projectId: rev.project_id,
      revisionNo: Number(rev.revision_no),
      manifestKey: rev.manifest_key,
      manifestHash: rev.manifest_hash,
      authorId: rev.author_id,
      source: rev.source,
      label: rev.label,
      createdAt: rev.created_at.toISOString(),
      manifest,
      items: itemsRes.rows.map((r) => ({
        nodeId: r.node_id,
        path: r.path,
        blobKey: r.blob_key,
        sha256: r.sha256,
        deleted: r.deleted,
      })),
    };
  }

  /**
   * Compares two revisions of the same project (COL-10).
   */
  async compareRevisions(
    projectId: string,
    baseRevisionNo: number,
    targetRevisionNo: number,
  ): Promise<{
    added: Array<{ path: string; nodeId: string; sha256: string }>;
    removed: Array<{ path: string; nodeId: string; sha256: string }>;
    modified: Array<{ path: string; nodeId: string; oldSha256: string; newSha256: string }>;
    unchanged: Array<{ path: string; nodeId: string; sha256: string }>;
  }> {
    const base = await this.getRevision(projectId, baseRevisionNo);
    const target = await this.getRevision(projectId, targetRevisionNo);

    if (!base || !target) {
      throw new Error(`Revision ${!base ? baseRevisionNo : targetRevisionNo} not found`);
    }

    const baseMap = new Map(base.items.map((i) => [i.path, i]));
    const targetMap = new Map(target.items.map((i) => [i.path, i]));

    const added: Array<{ path: string; nodeId: string; sha256: string }> = [];
    const removed: Array<{ path: string; nodeId: string; sha256: string }> = [];
    const modified: Array<{ path: string; nodeId: string; oldSha256: string; newSha256: string }> = [];
    const unchanged: Array<{ path: string; nodeId: string; sha256: string }> = [];

    for (const [path, targetItem] of targetMap.entries()) {
      const baseItem = baseMap.get(path);
      if (!baseItem) {
        added.push({ path, nodeId: targetItem.nodeId, sha256: targetItem.sha256 });
      } else if (baseItem.sha256 !== targetItem.sha256) {
        modified.push({
          path,
          nodeId: targetItem.nodeId,
          oldSha256: baseItem.sha256,
          newSha256: targetItem.sha256,
        });
      } else {
        unchanged.push({ path, nodeId: targetItem.nodeId, sha256: targetItem.sha256 });
      }
    }

    for (const [path, baseItem] of baseMap.entries()) {
      if (!targetMap.has(path)) {
        removed.push({ path, nodeId: baseItem.nodeId, sha256: baseItem.sha256 });
      }
    }

    return { added, removed, modified, unchanged };
  }
}
