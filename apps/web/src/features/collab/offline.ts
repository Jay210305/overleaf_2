import * as Y from "yjs";
import type { DurableAck } from "@latex-collab/contracts";
export type SaveStatus = "saved" | "saving" | "offline" | "error";

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
      return false;
    }
  }

  return true;
}

export interface PendingUpdateRecord {
  id: string;
  fileId: string;
  updateBase64: string;
  timestamp: number;
}

export interface OfflineStorageProvider {
  savePendingUpdate(fileId: string, update: Uint8Array): Promise<void>;
  getPendingUpdates(fileId: string): Promise<Uint8Array[]>;
  clearPendingUpdates(fileId: string): Promise<void>;
}

export class MemoryOfflineStorageProvider implements OfflineStorageProvider {
  private queue = new Map<string, Uint8Array[]>();

  async savePendingUpdate(fileId: string, update: Uint8Array): Promise<void> {
    const list = this.queue.get(fileId) ?? [];
    list.push(update);
    this.queue.set(fileId, list);
  }

  async getPendingUpdates(fileId: string): Promise<Uint8Array[]> {
    return [...(this.queue.get(fileId) ?? [])];
  }

  async clearPendingUpdates(fileId: string): Promise<void> {
    this.queue.delete(fileId);
  }
}

/**
 * Calculates exponential backoff delay with jitter to prevent reconnect storm loops.
 */
export function calculateBackoffDelayMs(
  attempt: number,
  baseMs = 500,
  maxMs = 30_000,
): number {
  const exp = Math.min(attempt, 8);
  const factor = Math.pow(2, exp);
  const delay = Math.min(baseMs * factor, maxMs);
  const jitter = Math.floor(Math.random() * (delay * 0.2));
  return delay + jitter;
}

export interface ReconnectManagerOptions {
  fileId: string;
  projectId: string;
  storage?: OfflineStorageProvider;
  fetchTicket: () => Promise<string>;
  sendUpdate: (update: Uint8Array) => Promise<void>;
  onStatusChange?: (status: SaveStatus) => void;
}

/**
 * Manages offline resilience, bounded exponential backoff reconnection,
 * and durable acknowledgement coverage.
 */
export class OfflineReconnectManager {
  private storage: OfflineStorageProvider;
  private pendingLocalVectors: Uint8Array[] = [];
  private saveStatus: SaveStatus = "saved";
  private reconnectAttempt = 0;
  private isOnline = true;

  constructor(private readonly options: ReconnectManagerOptions) {
    this.storage = options.storage ?? new MemoryOfflineStorageProvider();
  }

  getStatus(): SaveStatus {
    return this.saveStatus;
  }

  getPendingCount(): number {
    return this.pendingLocalVectors.length;
  }

  getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  /**
   * Called when an edit occurs while offline or online.
   */
  async recordEdit(currentDoc: Y.Doc, updateBytes: Uint8Array): Promise<void> {
    const vector = Y.encodeStateVector(currentDoc);
    this.pendingLocalVectors.push(vector);
    await this.storage.savePendingUpdate(this.options.fileId, updateBytes);

    if (this.isOnline) {
      this.setStatus("saving");
      try {
        await this.options.sendUpdate(updateBytes);
      } catch {
        this.setOffline();
      }
    } else {
      this.setStatus("offline");
    }
  }

  setOffline(): void {
    this.isOnline = false;
    this.setStatus("offline");
  }

  /**
   * Executes reconnection:
   * 1. Calculates exponential backoff delay (avoids tight loop).
   * 2. Requests fresh single-use ticket.
   * 3. Flushes queued pending updates from storage.
   */
  async reconnect(): Promise<{ freshTicket: string; flushedCount: number }> {
    const delay = calculateBackoffDelayMs(this.reconnectAttempt);
    this.reconnectAttempt++;

    // Bounded backoff
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 50)));

    let freshTicket: string;
    try {
      // Request new ticket for reconnect
      freshTicket = await this.options.fetchTicket();
    } catch (err) {
      this.setOffline();
      throw err;
    }

    this.isOnline = true;

    // Flush pending offline updates
    const pendingUpdates = await this.storage.getPendingUpdates(this.options.fileId);
    let flushedCount = 0;

    try {
      for (const update of pendingUpdates) {
        await this.options.sendUpdate(update);
        flushedCount++;
      }
    } catch (err) {
      this.setOffline();
      throw err;
    }

    if (this.pendingLocalVectors.length > 0) {
      this.setStatus("saving");
    } else {
      this.setStatus("saved");
    }

    // Reset attempt counter on successful reconnect
    this.reconnectAttempt = 0;

    return { freshTicket, flushedCount };
  }

  /**
   * Processes server DurableAck.
   * Transitions saveStatus to 'saved' ONLY when the state vector covers all pending edits.
   */
  async handleDurableAck(ack: DurableAck): Promise<boolean> {
    if (ack.type !== "text.durable_ack" || ack.version !== 1) return false;

    const serverVectorBytes = Buffer.from(ack.stateVectorBase64, "base64");

    this.pendingLocalVectors = this.pendingLocalVectors.filter((localVec) => {
      return !isStateVectorCovered(serverVectorBytes, localVec);
    });

    if (this.pendingLocalVectors.length === 0) {
      await this.storage.clearPendingUpdates(this.options.fileId);
      this.setStatus("saved");
      return true;
    } else {
      this.setStatus(this.isOnline ? "saving" : "offline");
      return false;
    }
  }

  private setStatus(status: SaveStatus): void {
    if (this.saveStatus !== status) {
      this.saveStatus = status;
      this.options.onStatusChange?.(status);
    }
  }
}
