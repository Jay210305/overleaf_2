import * as Y from "yjs";
import type { DurableAck } from "@latex-collab/contracts";

/**
 * Creates a validated DurableAck payload ONLY after a database commit.
 */
export function createDurableAck(
  fileId: string,
  persistedSeq: number,
  docOrStateVector: Y.Doc | Uint8Array,
): DurableAck {
  const stateVector =
    docOrStateVector instanceof Y.Doc ? Y.encodeStateVector(docOrStateVector) : docOrStateVector;

  return {
    type: "text.durable_ack",
    version: 1,
    fileId,
    persistedSeq,
    stateVectorBase64: Buffer.from(stateVector).toString("base64"),
  };
}

/**
 * Checks whether a server's committed state vector covers all local clocks of a client.
 * In Yjs, a state vector is a Map<clientID, clock>.
 * The server vector covers the client vector if and only if for every (client, clock) in local,
 * serverClock >= localClock.
 */
export function isStateVectorCovered(
  serverVector: Uint8Array | string,
  localVector: Uint8Array | string,
): boolean {
  const serverBytes =
    typeof serverVector === "string" ? Buffer.from(serverVector, "base64") : serverVector;
  const localBytes =
    typeof localVector === "string" ? Buffer.from(localVector, "base64") : localVector;

  const serverMap = Y.decodeStateVector(serverBytes);
  const localMap = Y.decodeStateVector(localBytes);

  for (const [clientId, localClock] of localMap.entries()) {
    const serverClock = serverMap.get(clientId) ?? 0;
    if (serverClock < localClock) {
      return false; // Local edit has not yet been covered by server commit
    }
  }

  return true;
}

export type SaveStatus = "saved" | "saving" | "offline" | "error";

/**
 * Client-side tracker that manages pending local updates and updates the
 * UI save status based on incoming DurableAck state vectors.
 */
export class ClientSaveTracker {
  private pendingLocalVectors: Uint8Array[] = [];
  private lastPersistedSeq = 0;
  private currentStatus: SaveStatus = "saved";
  private isOnline = true;

  constructor(
    private readonly onStatusChange?: (status: SaveStatus) => void,
    readonly fileId?: string | undefined,
  ) {}

  /**
   * Called whenever the local user edits the document.
   */
  recordLocalEdit(currentDoc: Y.Doc): void {
    const vector = Y.encodeStateVector(currentDoc);
    this.pendingLocalVectors.push(vector);
    this.setStatus(this.isOnline ? "saving" : "offline");
  }

  /**
   * Called when the connection drops.
   */
  setOnline(online: boolean): void {
    this.isOnline = online;
    if (!online) {
      this.setStatus("offline");
    } else if (this.pendingLocalVectors.length > 0) {
      this.setStatus("saving");
    } else {
      this.setStatus("saved");
    }
  }

  /**
   * Called when a database outage or socket error occurs during save.
   */
  setError(): void {
    this.setStatus("error");
  }

  /**
   * Processes a server DurableAck.
   * Only transitions to 'saved' if the ACK's state vector covers all pending local edits.
   */
  handleDurableAck(ack: DurableAck | { type: string; [key: string]: unknown }): boolean {
    if (
      ack.type !== "text.durable_ack" ||
      !("version" in ack) ||
      ack["version"] !== 1 ||
      typeof ack["persistedSeq"] !== "number" ||
      typeof ack["stateVectorBase64"] !== "string"
    ) {
      return false;
    }

    const typedAck = ack as DurableAck;
    if (this.fileId && typedAck.fileId !== this.fileId) {
      return false;
    }

    this.lastPersistedSeq = Math.max(this.lastPersistedSeq, typedAck.persistedSeq);
    const serverVectorBytes = Buffer.from(typedAck.stateVectorBase64, "base64");

    // Remove covered pending vectors from the front
    this.pendingLocalVectors = this.pendingLocalVectors.filter((localVec) => {
      return !isStateVectorCovered(serverVectorBytes, localVec);
    });

    if (this.pendingLocalVectors.length === 0) {
      this.setStatus("saved");
      return true;
    } else {
      this.setStatus(this.isOnline ? "saving" : "offline");
      return false;
    }
  }

  getStatus(): SaveStatus {
    return this.currentStatus;
  }

  getLastPersistedSeq(): number {
    return this.lastPersistedSeq;
  }

  getPendingCount(): number {
    return this.pendingLocalVectors.length;
  }

  private setStatus(status: SaveStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.onStatusChange?.(status);
    }
  }
}
