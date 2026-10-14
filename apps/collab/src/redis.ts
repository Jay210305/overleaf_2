import { randomUUID } from "node:crypto";
import type { createClient } from "redis";

export interface RedisMessage {
  replicaId: string;
  roomId: string;
  updateBase64: string;
  timestamp: number;
}

export interface AwarenessMessage {
  replicaId: string;
  roomId: string;
  awareness: unknown;
  timestamp: number;
}

export type RedisClientType = ReturnType<typeof createClient>;

export class CollabRedisCoordinator {
  readonly replicaId = randomUUID();
  private pubClient: RedisClientType | undefined;
  private subClient: RedisClientType | undefined;
  private updateHandlers = new Map<string, (updateBytes: Uint8Array, originReplicaId: string) => void>();
  private awarenessHandlers = new Map<string, (awareness: unknown, originReplicaId: string) => void>();
  private invalidationHandlers: Array<(data: unknown) => void> = [];

  constructor(options?: { pubClient?: RedisClientType | undefined; subClient?: RedisClientType | undefined } | undefined) {
    this.pubClient = options?.pubClient;
    this.subClient = options?.subClient;
  }

  setClients(pub: RedisClientType, sub: RedisClientType) {
    this.pubClient = pub;
    this.subClient = sub;
  }

  async init(): Promise<void> {
    if (this.subClient) {
      await this.subClient.pSubscribe("collab:room:*:updates", (message, _channel) => {
        try {
          const parsed = JSON.parse(message) as RedisMessage;
          if (parsed.replicaId === this.replicaId) return; // Ignore own echoes
          const handler = this.updateHandlers.get(parsed.roomId);
          if (handler) {
            handler(Buffer.from(parsed.updateBase64, "base64"), parsed.replicaId);
          }
        } catch {
          // ignore corrupted frame
        }
      });

      await this.subClient.pSubscribe("collab:room:*:awareness", (message) => {
        try {
          const parsed = JSON.parse(message) as AwarenessMessage;
          if (parsed.replicaId === this.replicaId) return;
          const handler = this.awarenessHandlers.get(parsed.roomId);
          if (handler) {
            handler(parsed.awareness, parsed.replicaId);
          }
        } catch {
          // ignore corrupted frame
        }
      });

      await this.subClient.subscribe("collab:invalidations", (message) => {
        try {
          const parsed = JSON.parse(message);
          for (const handler of this.invalidationHandlers) {
            handler(parsed);
          }
        } catch {
          // ignore
        }
      });
    }
  }

  registerRoom(
    roomId: string,
    onUpdate: (updateBytes: Uint8Array, originReplicaId: string) => void,
    onAwareness?: (awareness: unknown, originReplicaId: string) => void,
  ): void {
    this.updateHandlers.set(roomId, onUpdate);
    if (onAwareness) {
      this.awarenessHandlers.set(roomId, onAwareness);
    }
  }

  unregisterRoom(roomId: string): void {
    this.updateHandlers.delete(roomId);
    this.awarenessHandlers.delete(roomId);
  }

  onInvalidation(handler: (data: unknown) => void): void {
    this.invalidationHandlers.push(handler);
  }

  async broadcastUpdate(roomId: string, update: Uint8Array): Promise<void> {
    const msg: RedisMessage = {
      replicaId: this.replicaId,
      roomId,
      updateBase64: Buffer.from(update).toString("base64"),
      timestamp: Date.now(),
    };

    if (this.pubClient) {
      await this.pubClient.publish(`collab:room:${roomId}:updates`, JSON.stringify(msg));
    }
  }

  async broadcastAwareness(roomId: string, awareness: unknown): Promise<void> {
    const msg: AwarenessMessage = {
      replicaId: this.replicaId,
      roomId,
      awareness,
      timestamp: Date.now(),
    };

    if (this.pubClient) {
      await this.pubClient.publish(`collab:room:${roomId}:awareness`, JSON.stringify(msg));
    }
  }

  async publishInvalidation(data: unknown): Promise<void> {
    if (this.pubClient) {
      await this.pubClient.publish("collab:invalidations", JSON.stringify(data));
    }
  }

  /**
   * For in-process test environments with multiple simulated coordinators.
   */
  static linkInProcess(coordA: CollabRedisCoordinator, coordB: CollabRedisCoordinator): () => void {
    const origBroadcastA = coordA.broadcastUpdate.bind(coordA);
    const origBroadcastB = coordB.broadcastUpdate.bind(coordB);

    coordA.broadcastUpdate = async (roomId, update) => {
      await origBroadcastA(roomId, update);
      const handlerB = coordB.updateHandlers.get(roomId);
      if (handlerB) handlerB(update, coordA.replicaId);
    };

    coordB.broadcastUpdate = async (roomId, update) => {
      await origBroadcastB(roomId, update);
      const handlerA = coordA.updateHandlers.get(roomId);
      if (handlerA) handlerA(update, coordB.replicaId);
    };

    return () => {
      coordA.broadcastUpdate = origBroadcastA;
      coordB.broadcastUpdate = origBroadcastB;
    };
  }
}
