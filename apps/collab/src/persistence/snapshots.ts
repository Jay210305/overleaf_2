import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import type { DatabaseClient, TransactionContext } from "@latex-collab/db";

export class SnapshotVerificationError extends Error {
  constructor(message = "Snapshot state verification failed") {
    super(message);
    this.name = "SnapshotVerificationError";
  }
}

export interface CompactSnapshotResult {
  snapshotId: string;
  uptoSeq: number;
  contentSha256: string;
  prunedCount: number;
}

export class SnapshotService {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Creates a compacted snapshot of CRDT state up to targetSeq.
   * Strictly verifies that the encoded snapshot reproduces identical plaintext
   * and content SHA-256 BEFORE updating text_documents or pruning covered updates.
   */
  async compact(
    fileId: string,
    options: {
      uptoSeq?: number;
      pruneCoveredUpdates?: boolean;
    } = {},
    txContext?: TransactionContext,
  ): Promise<CompactSnapshotResult> {
    const run = async (tx: TransactionContext) => {
      // 1. Lock text document to avoid racing writes during compaction
      const docRes = await tx.query<{
        last_persisted_seq: number;
        latest_snapshot_id: string | null;
      }>(
        `SELECT last_persisted_seq, latest_snapshot_id FROM text_documents WHERE file_id = $1 FOR UPDATE`,
        [fileId],
      );
      const docRow = docRes.rows[0];
      const maxSeq = Number(docRow?.last_persisted_seq ?? 0);
      const targetSeq = options.uptoSeq !== undefined ? Math.min(options.uptoSeq, maxSeq) : maxSeq;

      // 2. Reconstruct state up to targetSeq
      const doc = new Y.Doc();
      let priorUptoSeq = 0;

      if (docRow?.latest_snapshot_id) {
        const priorSnapRes = await tx.query<{
          upto_seq: number;
          state_bytes: Buffer | null;
        }>(`SELECT upto_seq, state_bytes FROM crdt_snapshots WHERE id = $1`, [
          docRow.latest_snapshot_id,
        ]);
        const prior = priorSnapRes.rows[0];
        if (prior?.state_bytes) {
          Y.applyUpdate(doc, new Uint8Array(prior.state_bytes));
          priorUptoSeq = Number(prior.upto_seq);
        }
      }

      // Fetch subsequent updates up to targetSeq
      const updatesRes = await tx.query<{
        seq: number;
        payload_bytes: Buffer;
      }>(
        `SELECT seq, payload_bytes FROM crdt_updates WHERE file_id = $1 AND seq > $2 AND seq <= $3 ORDER BY seq ASC`,
        [fileId, priorUptoSeq, targetSeq],
      );

      for (const row of updatesRes.rows) {
        Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
      }

      const text = doc.getText("content").toString();
      const contentSha256 = createHash("sha256").update(text, "utf8").digest("hex");
      const stateBytes = Buffer.from(Y.encodeStateAsUpdate(doc));
      const snapshotId = randomUUID();

      // 3. VERIFICATION STEP:
      // Create an independent Y.Doc from stateBytes and verify text and hash match exactly
      const verifyDoc = new Y.Doc();
      Y.applyUpdate(verifyDoc, new Uint8Array(stateBytes));
      const verifiedText = verifyDoc.getText("content").toString();
      const verifiedHash = createHash("sha256").update(verifiedText, "utf8").digest("hex");

      if (verifiedText !== text || verifiedHash !== contentSha256) {
        throw new SnapshotVerificationError(
          `Snapshot verification mismatch: expected hash ${contentSha256}, got ${verifiedHash}`,
        );
      }

      // 4. Persist snapshot record
      await tx.query(
        `INSERT INTO crdt_snapshots (id, file_id, upto_seq, state_bytes, content_sha256, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [snapshotId, fileId, targetSeq, stateBytes, contentSha256],
      );

      // 5. Update latest_snapshot_id in text_documents
      await tx.query(
        `UPDATE text_documents SET latest_snapshot_id = $1, updated_at = NOW() WHERE file_id = $2`,
        [snapshotId, fileId],
      );

      // 6. Prune covered updates if requested
      let prunedCount = 0;
      if (options.pruneCoveredUpdates) {
        const delRes = await tx.query<{ count: string }>(
          `WITH deleted AS (
             DELETE FROM crdt_updates WHERE file_id = $1 AND seq <= $2 RETURNING id
           ) SELECT count(*) FROM deleted`,
          [fileId, targetSeq],
        );
        prunedCount = Number(delRes.rows[0]?.count ?? 0);
      }

      return {
        snapshotId,
        uptoSeq: targetSeq,
        contentSha256,
        prunedCount,
      };
    };

    if (txContext) {
      return await run(txContext);
    }
    return await this.db.transaction(run);
  }
}
