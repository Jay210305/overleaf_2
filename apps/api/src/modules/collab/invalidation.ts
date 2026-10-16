import { createClient, type RedisClientType } from "redis";

/**
 * Invalidation events consumed by the collaboration service
 * (`collab:invalidations` channel, same shape as its RevocationEvent).
 * Publishing closes already-open collaboration sockets after the database
 * already denies new REST/WSS access; delivery is at-least-once.
 */
export type CollabInvalidationEvent =
  | { type: "session_revoked"; sessionId: string }
  | { type: "member_removed"; userId: string; projectId: string }
  | {
      type: "role_changed";
      userId: string;
      projectId: string;
      newRole: "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER";
    };

export interface CollabInvalidationPublisher {
  publish(event: CollabInvalidationEvent): Promise<void>;
  close(): Promise<void>;
}

export function noopCollabInvalidationPublisher(): CollabInvalidationPublisher {
  return {
    async publish() {},
    async close() {},
  };
}

export async function createRedisCollabInvalidationPublisher(
  url: string,
): Promise<CollabInvalidationPublisher> {
  const client: RedisClientType = createClient({
    url,
    socket: { connectTimeout: 1500, reconnectStrategy: false },
  });
  client.on("error", () => {
    // Publish failures surface at the call site; connection details stay out of logs.
  });
  await client.connect();
  return {
    async publish(event: CollabInvalidationEvent) {
      await client.publish("collab:invalidations", JSON.stringify(event));
    },
    async close() {
      if (client.isOpen) client.destroy();
    },
  };
}
