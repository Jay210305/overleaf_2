import type { DatabaseClient } from "../client.js";

export interface AnchorDetachmentResult {
  detachedCommentIds: string[];
  conflictedSuggestionIds: string[];
}

/**
 * Detaches comments and marks pending suggestions as conflicted for files that
 * have been modified or deleted as part of a restore, import or sync
 * operation.
 *
 * Invariant: Unresolvable relative-position comment anchors become 'detached'
 * rather than anchoring to incorrect text. Shared by the API history restore
 * (S09-T06) and the jobs GitHub pull apply (S12-T08) so both paths keep the
 * same metadata guarantee.
 */
export async function detachAnchorsForChangedNodes(
  db: { query: DatabaseClient["query"] },
  projectId: string,
  changedNodeIds: string[],
): Promise<AnchorDetachmentResult> {
  if (changedNodeIds.length === 0) {
    return { detachedCommentIds: [], conflictedSuggestionIds: [] };
  }

  // 1. Find all open comments anchored to the changed nodes
  const commentsRes = await db.query<{ id: string }>(
    `SELECT id FROM comments
     WHERE project_id = $1
       AND file_id = ANY($2::uuid[])
       AND status = 'open'`,
    [projectId, changedNodeIds],
  );

  const detachedCommentIds = commentsRes.rows.map((r) => r.id);

  if (detachedCommentIds.length > 0) {
    await db.query(
      `UPDATE comments
       SET status = 'detached'
       WHERE id = ANY($1::uuid[])`,
      [detachedCommentIds],
    );
  }

  // 2. Find and conflict any pending suggestions anchored to the changed nodes
  const suggestionsRes = await db.query<{ id: string }>(
    `SELECT id FROM suggestions
     WHERE project_id = $1
       AND file_id = ANY($2::uuid[])
       AND status = 'pending'`,
    [projectId, changedNodeIds],
  );

  const conflictedSuggestionIds = suggestionsRes.rows.map((r) => r.id);

  if (conflictedSuggestionIds.length > 0) {
    await db.query(
      `UPDATE suggestions
       SET status = 'conflict'
       WHERE id = ANY($1::uuid[])`,
      [conflictedSuggestionIds],
    );
  }

  return {
    detachedCommentIds,
    conflictedSuggestionIds,
  };
}
