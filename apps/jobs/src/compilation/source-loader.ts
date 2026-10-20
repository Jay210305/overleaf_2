import type { DatabaseClient } from "@latex-collab/db";
import type { RevisionManifest, StorageAdapter } from "@latex-collab/contracts";

export type ManifestItem = RevisionManifest["items"][number];

/**
 * Loads frozen source bytes for one manifest item.
 * Returns bytes, or null when the loader has no record (caller may fall back).
 * Throws when a declared binary object is missing so the job fails closed
 * instead of compiling substitute content.
 */
export type ManifestItemLoader = (
  manifest: RevisionManifest,
  item: ManifestItem,
) => Promise<Uint8Array | null>;

/**
 * Loads genuine frozen revision content (S06-T02, CMP-01, NFR-06).
 * - TEXT: authoritative `revision_items.text_bytes` frozen at enqueue time.
 * - BINARY: private object store bytes at `item.object.key`.
 */
export function createRevisionSourceLoader(
  db: DatabaseClient,
  storage: StorageAdapter,
): ManifestItemLoader {
  return async (manifest, item) => {
    if (item.kind === "TEXT") {
      const res = await db.query<{ text_bytes: Buffer | null }>(
        `SELECT text_bytes FROM revision_items WHERE revision_id = $1 AND node_id = $2`,
        [manifest.revisionId, item.nodeId],
      );
      const bytes = res.rows[0]?.text_bytes;
      if (bytes && bytes.length > 0) return new Uint8Array(bytes);
      return null;
    }
    const bytes = await storage.get(item.object.key);
    return bytes;
  };
}
