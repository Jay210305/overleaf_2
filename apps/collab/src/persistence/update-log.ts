import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import type { DatabaseClient, TransactionContext } from "@latex-collab/db";

export interface ReplayResult {
  doc: Y.Doc;
  lastPersistedSeq: number;
  contentSha256: string;
  text: string;
  stateVector: Uint8Array;
}

export class UpdateLog {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Atomically appends a validated CRDT update under a PostgreSQL row lock.
   * Allocates a strictly monotonic sequence per fileId.
   */
  async appendUpdate(
    fileId: string,
    actorId: string | null,
    updateBytes: Uint8Array,
    txContext?: TransactionContext,
  ): Promise<{ seq: number; updateId: string }> {
    const run = async (tx: TransactionContext | DatabaseClient) => {
      // 1. Lock text document row
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

      // 3. Advance last_persisted_seq
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
   * Duplicate or out-of-order updates converge safely due to Yjs CRDT commutativity & idempotency.
   */
  async replay(fileId: string, txContext?: TransactionContext): Promise<ReplayResult> {
    const client = txContext ?? this.db;
    const doc = new Y.Doc();

    // 1. Fetch text_documents record
    const docRes = await client.query<{
      latest_snapshot_id: string | null;
      last_persisted_seq: number;
    }>(
      `SELECT latest_snapshot_id, last_persisted_seq FROM text_documents WHERE file_id = $1`,
      [fileId],
    );
    const docRow = docRes.rows[0];
    const lastPersistedSeq = docRow ? Number(docRow.last_persisted_seq) : 0;
    let uptoSeq = 0;

    // 2. Fetch and apply latest snapshot if present
    if (docRow?.latest_snapshot_id) {
      const snapRes = await client.query<{
        upto_seq: number;
        state_bytes: Buffer | null;
      }>(
        `SELECT upto_seq, state_bytes FROM crdt_snapshots WHERE id = $1`,
        [docRow.latest_snapshot_id],
      );
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
    const stateVector = Y.encodeStateVector(doc);

    return {
      doc,
      lastPersistedSeq,
      contentSha256,
      text,
      stateVector,
    };
  }

  /**
   * Applies an arbitrary list of Yjs update chunks to an in-memory document
   * to test convergence under any reordering or duplication.
   */
  static applyUpdatesInOrder(updates: Uint8Array[]): ReplayResult {
    const doc = new Y.Doc();
    for (const update of updates) {
      Y.applyUpdate(doc, update);
    }
    const text = doc.getText("content").toString();
    const contentSha256 = createHash("sha256").update(text, "utf8").digest("hex");
    const stateVector = Y.encodeStateVector(doc);
    return {
      doc,
      lastPersistedSeq: updates.length,
      contentSha256,
      text,
      stateVector,
    };
  }
}
