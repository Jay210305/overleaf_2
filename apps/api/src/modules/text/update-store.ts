import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import type { DatabaseClient, TransactionContext } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";

export interface SnapshotRecord {
  id: string;
  fileId: string;
  uptoSeq: number;
  stateBytes: Buffer | null;
  contentSha256: string;
  createdAt: Date;
}

export interface ReplayResult {
  doc: Y.Doc;
  lastPersistedSeq: number;
  contentSha256: string;
  text: string;
}

export class UpdateStore {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Appends a new CRDT update under an atomic sequence allocation.
   */
  async appendUpdate(
    fileId: string,
    actorId: string,
    updateBytes: Uint8Array,
    txContext?: TransactionContext,
  ): Promise<{ seq: number; updateId: string }> {
    const run = async (tx: TransactionContext | DatabaseClient) => {
      // 1. Lock text document
      const docRes = await tx.query<{ last_persisted_seq: number }>(
        `SELECT last_persisted_seq FROM text_documents WHERE file_id = $1 FOR UPDATE`,
        [fileId],
      );
      const currentSeq = Number(docRes.rows[0]?.last_persisted_seq ?? 0);
      const nextSeq = currentSeq + 1;
      const updateId = randomUUID();

      // 2. Insert CRDT update
      await tx.query(
        `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [updateId, fileId, nextSeq, actorId, Buffer.from(updateBytes)],
      );

      // 3. Update last_persisted_seq
      await tx.query(
        `UPDATE text_documents SET last_persisted_seq = $1, updated_at = NOW() WHERE file_id = $2`,
        [nextSeq, fileId],
      );

      return { seq: nextSeq, updateId };
    };

    if (txContext) {
      return await run(txContext);
    }
    return await this.db.transaction(run);
  }

  /**
   * Replays snapshots and subsequent updates to reconstruct the canonical Y.Doc.
   * Duplicate updates do not cause double insertions due to CRDT idempotency.
   */
  async replay(fileId: string, txContext?: TransactionContext): Promise<ReplayResult> {
    const client = txContext ?? this.db;
    const doc = new Y.Doc();

    // 1. Fetch text_documents record
    const docRes = await client.query<{
      latest_snapshot_id: string | null;
      last_persisted_seq: number;
    }>(`SELECT latest_snapshot_id, last_persisted_seq FROM text_documents WHERE file_id = $1`, [
      fileId,
    ]);
    const docRow = docRes.rows[0];
    const lastPersistedSeq = docRow ? Number(docRow.last_persisted_seq) : 0;
    let uptoSeq = 0;

    // 2. Fetch and apply latest snapshot if present
    if (docRow?.latest_snapshot_id) {
      const snapRes = await client.query<{
        upto_seq: number;
        state_bytes: Buffer | null;
      }>(`SELECT upto_seq, state_bytes FROM crdt_snapshots WHERE id = $1`, [
        docRow.latest_snapshot_id,
      ]);
      const snap = snapRes.rows[0];
      if (snap?.state_bytes) {
        Y.applyUpdate(doc, new Uint8Array(snap.state_bytes));
        uptoSeq = Number(snap.upto_seq);
      }
    }

    // 3. Fetch and apply updates > uptoSeq in ascending sequence order
    const updatesRes = await client.query<{
      seq: number;
      payload_bytes: Buffer;
    }>(
      `SELECT seq, payload_bytes FROM crdt_updates WHERE file_id = $1 AND seq > $2 ORDER BY seq ASC`,
      [fileId, uptoSeq],
    );

    for (const row of updatesRes.rows) {
      Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
    }

    const text = doc.getText("content").toString();
    const contentSha256 = createHash("sha256").update(text, "utf8").digest("hex");

    return {
      doc,
      lastPersistedSeq,
      contentSha256,
      text,
    };
  }

  /**
   * Creates a compacted snapshot of the document state up to the specified seq,
   * verifies it before updating latest_snapshot_id, and optionally prunes covered updates.
   */
  async createSnapshot(
    fileId: string,
    uptoSeq?: number,
    options: { pruneCoveredUpdates?: boolean } = {},
    txContext?: TransactionContext,
  ): Promise<{ snapshotId: string; uptoSeq: number; contentSha256: string }> {
    const run = async (tx: TransactionContext) => {
      // Replay state up to uptoSeq
      const docRes = await tx.query<{ last_persisted_seq: number }>(
        `SELECT last_persisted_seq FROM text_documents WHERE file_id = $1 FOR UPDATE`,
        [fileId],
      );
      const maxSeq = Number(docRes.rows[0]?.last_persisted_seq ?? 0);
      const targetSeq = uptoSeq !== undefined ? Math.min(uptoSeq, maxSeq) : maxSeq;

      // Build Y.Doc from all updates up to targetSeq
      const doc = new Y.Doc();
      const updatesRes = await tx.query<{ seq: number; payload_bytes: Buffer }>(
        `SELECT seq, payload_bytes FROM crdt_updates WHERE file_id = $1 AND seq <= $2 ORDER BY seq ASC`,
        [fileId, targetSeq],
      );

      for (const row of updatesRes.rows) {
        Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
      }

      const text = doc.getText("content").toString();
      const contentSha256 = createHash("sha256").update(text, "utf8").digest("hex");
      const stateBytes = Buffer.from(Y.encodeStateAsUpdate(doc));
      const snapshotId = randomUUID();

      // Verify that reconstructing from stateBytes alone produces exact same text & hash
      const verifyDoc = new Y.Doc();
      Y.applyUpdate(verifyDoc, new Uint8Array(stateBytes));
      const verifiedText = verifyDoc.getText("content").toString();
      if (verifiedText !== text) {
        throw new AuthError(500, "SNAPSHOT_VERIFICATION_FAILED");
      }

      // Persist snapshot record
      await tx.query(
        `INSERT INTO crdt_snapshots (id, file_id, upto_seq, state_bytes, content_sha256, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [snapshotId, fileId, targetSeq, stateBytes, contentSha256],
      );

      // Point text_documents.latest_snapshot_id to this snapshot
      await tx.query(
        `UPDATE text_documents SET latest_snapshot_id = $1, updated_at = NOW() WHERE file_id = $2`,
        [snapshotId, fileId],
      );

      // Optionally prune covered updates
      if (options.pruneCoveredUpdates) {
        await tx.query(`DELETE FROM crdt_updates WHERE file_id = $1 AND seq <= $2`, [
          fileId,
          targetSeq,
        ]);
      }

      return {
        snapshotId,
        uptoSeq: targetSeq,
        contentSha256,
      };
    };

    if (txContext) {
      return await run(txContext);
    }
    return await this.db.transaction(run);
  }
}
