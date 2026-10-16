import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import type { DatabaseClient, TransactionContext } from "@latex-collab/db";
import type { TextState } from "@latex-collab/contracts";
import { AuthError } from "../auth/errors.js";

const MAX_UPDATE_BYTES = 1024 * 1024; // 1 MiB mutation frame cap

export interface TextDocumentService {
  load(projectId: string, fileId: string, actorId: string): Promise<TextState>;
  apply(
    projectId: string,
    fileId: string,
    actorId: string,
    input: { updateBase64: string; baseStateVectorBase64: string },
  ): Promise<TextState>;
  getTextContent(projectId: string, fileId: string, actorId: string): Promise<string>;
}

export class DefaultTextDocumentService implements TextDocumentService {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Verifies that the actor has permission to access the project and file.
   * Enforces server-side authorization:
   * - Foreign or missing project / deleted file -> 404
   * - VIEWER / REVIEWER attempting EDIT -> 403
   */
  private async checkAccess(
    projectId: string,
    fileId: string,
    actorId: string,
    requiredAction: "READ" | "EDIT",
    client: DatabaseClient | TransactionContext = this.db,
  ): Promise<void> {
    // 1. Verify project
    const projRes = await client.query<{ owner_id: string; status: string }>(
      `SELECT owner_id, status FROM projects WHERE id = $1`,
      [projectId],
    );
    const proj = projRes.rows[0];
    if (!proj || proj.status === "trashed") {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }

    // 2. Verify actor membership & role
    if (proj.owner_id !== actorId) {
      const memberRes = await client.query<{ role: string }>(
        `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
        [projectId, actorId],
      );
      const member = memberRes.rows[0];
      if (!member) {
        throw new AuthError(404, "RESOURCE_NOT_FOUND");
      }

      if (requiredAction === "EDIT") {
        if (member.role === "VIEWER" || member.role === "REVIEWER") {
          throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
        }
      }
    }

    // 3. Verify file exists in project and is not deleted
    const fileRes = await client.query<{
      id: string;
      kind: string;
      content_kind: string;
      deleted_at: Date | null;
    }>(
      `SELECT id, kind, content_kind, deleted_at FROM project_nodes WHERE id = $1 AND project_id = $2`,
      [fileId, projectId],
    );
    const file = fileRes.rows[0];
    if (!file || file.deleted_at !== null) {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }
    if (file.content_kind !== "TEXT") {
      throw new AuthError(400, "VALIDATION_ERROR");
    }
  }

  /**
   * Reconstructs the canonical Y.Doc from snapshots and sequential CRDT updates.
   */
  private async reconstructDoc(
    fileId: string,
    client: DatabaseClient | TransactionContext = this.db,
  ): Promise<{ doc: Y.Doc; lastPersistedSeq: number }> {
    const doc = new Y.Doc();

    // Check text_documents record
    const docRes = await client.query<{
      latest_snapshot_id: string | null;
      last_persisted_seq: number;
    }>(`SELECT latest_snapshot_id, last_persisted_seq FROM text_documents WHERE file_id = $1`, [
      fileId,
    ]);
    const docRow = docRes.rows[0];
    const lastPersistedSeq = docRow ? Number(docRow.last_persisted_seq) : 0;
    let uptoSeq = 0;

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

    // Fetch and replay remaining CRDT updates with seq > uptoSeq
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

    return { doc, lastPersistedSeq };
  }

  /**
   * Loads the current canonical text state for a file.
   */
  async load(projectId: string, fileId: string, actorId: string): Promise<TextState> {
    await this.checkAccess(projectId, fileId, actorId, "READ");

    // Ensure text_documents row exists
    await this.db.query(
      `INSERT INTO text_documents (file_id, project_id, last_persisted_seq)
       VALUES ($1, $2, 0)
       ON CONFLICT (file_id) DO NOTHING`,
      [fileId, projectId],
    );

    const { doc, lastPersistedSeq } = await this.reconstructDoc(fileId);

    const update = Y.encodeStateAsUpdate(doc);
    const stateVector = Y.encodeStateVector(doc);

    return {
      fileId,
      updateBase64: Buffer.from(update).toString("base64"),
      stateVectorBase64: Buffer.from(stateVector).toString("base64"),
      persistedSeq: lastPersistedSeq,
    };
  }

  /**
   * Applies a validated Yjs update under a per-file lock and returns updated TextState.
   */
  async apply(
    projectId: string,
    fileId: string,
    actorId: string,
    input: { updateBase64: string; baseStateVectorBase64: string },
  ): Promise<TextState> {
    // 1. Decode and validate input frame
    const updateBytes = Buffer.from(input.updateBase64, "base64");
    if (updateBytes.length === 0) {
      throw new AuthError(400, "VALIDATION_ERROR");
    }
    if (updateBytes.length > MAX_UPDATE_BYTES) {
      throw new AuthError(413, "QUOTA_EXCEEDED");
    }

    // Validate update structure by testing against sandbox Y.Doc
    try {
      const sandbox = new Y.Doc();
      Y.applyUpdate(sandbox, new Uint8Array(updateBytes));
      sandbox.destroy();
    } catch {
      throw new AuthError(400, "VALIDATION_ERROR");
    }

    // 2. Perform atomic transaction with row lock
    return await this.db.transaction(async (tx) => {
      await this.checkAccess(projectId, fileId, actorId, "EDIT", tx);

      // Ensure record exists and lock it
      await tx.query(
        `INSERT INTO text_documents (file_id, project_id, last_persisted_seq)
         VALUES ($1, $2, 0)
         ON CONFLICT (file_id) DO NOTHING`,
        [fileId, projectId],
      );

      const lockRes = await tx.query<{
        last_persisted_seq: number;
      }>(`SELECT last_persisted_seq FROM text_documents WHERE file_id = $1 FOR UPDATE`, [fileId]);
      const currentSeq = Number(lockRes.rows[0]?.last_persisted_seq ?? 0);

      // Reconstruct existing doc inside transaction
      const { doc } = await this.reconstructDoc(fileId, tx);

      // Verify base state vector for G1 single-editor flow
      const currentStateVector = Y.encodeStateVector(doc);
      const currentStateVectorBase64 = Buffer.from(currentStateVector).toString("base64");

      if (input.baseStateVectorBase64 !== currentStateVectorBase64) {
        throw new AuthError(409, "REVISION_CONFLICT");
      }

      // Apply client update to server doc
      Y.applyUpdate(doc, new Uint8Array(updateBytes));

      const nextSeq = currentSeq + 1;

      // Persist CRDT update row
      await tx.query(
        `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [randomUUID(), fileId, nextSeq, actorId, updateBytes],
      );

      // Advance last_persisted_seq
      await tx.query(
        `UPDATE text_documents SET last_persisted_seq = $1, updated_at = NOW() WHERE file_id = $2`,
        [nextSeq, fileId],
      );

      // Touch project updated_at
      await tx.query(`UPDATE projects SET updated_at = NOW() WHERE id = $1`, [projectId]);

      const updatedUpdate = Y.encodeStateAsUpdate(doc);
      const updatedVector = Y.encodeStateVector(doc);

      return {
        fileId,
        updateBase64: Buffer.from(updatedUpdate).toString("base64"),
        stateVectorBase64: Buffer.from(updatedVector).toString("base64"),
        persistedSeq: nextSeq,
      };
    });
  }

  /**
   * Returns decoded plaintext string content from the canonical Yjs document.
   */
  async getTextContent(projectId: string, fileId: string, actorId: string): Promise<string> {
    await this.checkAccess(projectId, fileId, actorId, "READ");
    const { doc } = await this.reconstructDoc(fileId);
    return doc.getText("content").toString();
  }
}
