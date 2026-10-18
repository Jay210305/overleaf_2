import { randomUUID } from "node:crypto";
import { isUUID, type DatabaseClient } from "@latex-collab/db";
import * as Y from "yjs";

export interface FileChange {
  path: string;
  content: string;
  oldContent?: string | undefined;
}

export interface CommentAnchor {
  id: string;
  fileId: string;
  filePath: string;
  startOffset: number;
  endOffset: number;
  highlightedText: string;
}

export interface DetachedAnchorReport {
  anchorId: string;
  filePath: string;
  reason: "deleted_range" | "text_mismatch" | "file_deleted";
  originalText: string;
}

export interface GitImportParams {
  db?: DatabaseClient | undefined;
  projectId: string;
  authorUserId: string;
  commitSha: string;
  commitMessage: string;
  changes: FileChange[];
  deletedPaths?: string[] | undefined;
  existingAnchors?: CommentAnchor[] | undefined;
}

export interface GitImportResult {
  ok: true;
  revisionId: string;
  revisionNo: number;
  appliedFiles: string[];
  detachedAnchors: DetachedAnchorReport[];
  yjsDocs: Map<string, Y.Doc>;
  yjsUpdates: Map<string, Uint8Array>;
}

/**
 * Applies incoming Git tree and text updates through canonical Yjs CRDT mutations,
 * creates a durable project revision record, and identifies detached comment anchors.
 */
export async function applyGitImport(params: GitImportParams): Promise<GitImportResult> {
  const appliedFiles: string[] = [];
  const detachedAnchors: DetachedAnchorReport[] = [];
  const yjsDocs = new Map<string, Y.Doc>();
  const yjsUpdates = new Map<string, Uint8Array>();

  const deletedPathsSet = new Set(params.deletedPaths ?? []);

  // 1. Process changed text files into canonical Yjs documents
  for (const change of params.changes) {
    const doc = new Y.Doc();
    const ytext = doc.getText("content");

    // Initialize with oldContent if present
    if (change.oldContent !== undefined && change.oldContent.length > 0) {
      ytext.insert(0, change.oldContent);
    }

    const stateVectorBefore = Y.encodeStateVector(doc);

    // Apply Git update canonically inside transaction
    doc.transact(() => {
      const currentLen = ytext.length;
      if (currentLen > 0) {
        ytext.delete(0, currentLen);
      }
      ytext.insert(0, change.content);
    });

    const updateBytes = Y.encodeStateAsUpdate(doc, stateVectorBefore);
    yjsDocs.set(change.path, doc);
    yjsUpdates.set(change.path, updateBytes);
    appliedFiles.push(change.path);
  }

  // 2. Detect detached comment / annotation anchors
  if (params.existingAnchors && params.existingAnchors.length > 0) {
    for (const anchor of params.existingAnchors) {
      if (deletedPathsSet.has(anchor.filePath)) {
        detachedAnchors.push({
          anchorId: anchor.id,
          filePath: anchor.filePath,
          reason: "file_deleted",
          originalText: anchor.highlightedText,
        });
        continue;
      }

      const changedFile = params.changes.find((c) => c.path === anchor.filePath);
      if (changedFile) {
        const newText = changedFile.content;
        if (anchor.startOffset > newText.length || anchor.endOffset > newText.length) {
          detachedAnchors.push({
            anchorId: anchor.id,
            filePath: anchor.filePath,
            reason: "deleted_range",
            originalText: anchor.highlightedText,
          });
        } else {
          const currentTextAtRange = newText.slice(anchor.startOffset, anchor.endOffset);
          if (currentTextAtRange !== anchor.highlightedText) {
            detachedAnchors.push({
              anchorId: anchor.id,
              filePath: anchor.filePath,
              reason: "text_mismatch",
              originalText: anchor.highlightedText,
            });
          }
        }
      }
    }
  }

  // 3. Persist revision in database if available
  const revisionId = randomUUID();
  let revisionNo = 1;

  if (params.db) {
    const maxRevRes = await params.db.query<{ max_rev: number | null }>(
      `SELECT MAX(revision_no) as max_rev FROM project_revisions WHERE project_id = $1`,
      [params.projectId],
    );
    revisionNo = Number(maxRevRes.rows[0]?.max_rev ?? 0) + 1;

    const manifestKey = `projects/${params.projectId}/revisions/rev-${revisionNo}.json`;
    const authorId =
      params.authorUserId && isUUID(params.authorUserId) ? params.authorUserId : null;
    await params.db.query(
      `INSERT INTO project_revisions (id, project_id, revision_no, manifest_key, manifest_hash, author_id, source, label, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'git', $7, NOW())`,
      [
        revisionId,
        params.projectId,
        revisionNo,
        manifestKey,
        params.commitSha,
        authorId,
        params.commitMessage,
      ],
    );

    await params.db.query(
      `UPDATE projects SET current_revision = $1, updated_at = NOW() WHERE id = $2`,
      [revisionNo, params.projectId],
    );
  }

  return {
    ok: true,
    revisionId,
    revisionNo,
    appliedFiles,
    detachedAnchors,
    yjsDocs,
    yjsUpdates,
  };
}

/**
 * Verifies concurrent recovery between an offline Web client edit and a Git import
 * targeting the same file on a common base document.
 */
export function mergeConcurrentGitAndWebEdits(
  baseContent: string,
  gitAppendedContent: string,
  webPrependContent: string,
): { mergedContent: string; docA: Y.Doc; docB: Y.Doc } {
  // Shared base
  const baseDoc = new Y.Doc();
  baseDoc.getText("content").insert(0, baseContent);
  const baseState = Y.encodeStateAsUpdate(baseDoc);

  // Client A: Web editor (offline / concurrent)
  const docWeb = new Y.Doc();
  Y.applyUpdate(docWeb, baseState);
  docWeb.getText("content").insert(0, webPrependContent);
  const webUpdate = Y.encodeStateAsUpdate(docWeb, Y.encodeStateVector(baseDoc));

  // Client B: Git bridge import (concurrent)
  const docGit = new Y.Doc();
  Y.applyUpdate(docGit, baseState);
  const gitText = docGit.getText("content");
  gitText.insert(gitText.length, gitAppendedContent);
  const gitUpdate = Y.encodeStateAsUpdate(docGit, Y.encodeStateVector(baseDoc));

  // Merge each into the other
  Y.applyUpdate(docWeb, gitUpdate);
  Y.applyUpdate(docGit, webUpdate);

  const mergedWeb = docWeb.getText("content").toString();
  const mergedGit = docGit.getText("content").toString();

  if (mergedWeb !== mergedGit) {
    throw new Error(`CRDT divergence: web='${mergedWeb}', git='${mergedGit}'`);
  }

  return {
    mergedContent: mergedWeb,
    docA: docWeb,
    docB: docGit,
  };
}
