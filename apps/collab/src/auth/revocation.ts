import type { TicketStore } from "./ticket.js";

export interface ActiveCollabSocket {
  userId: string;
  projectId: string;
  sessionId: string;
  action: "read" | "write";
  close(code?: number, reason?: string): void;
  send(message: string): void;
  setRole?(newRole: string): void;
}

export interface RevocationEvent {
  type: "session_revoked" | "role_changed" | "member_removed";
  userId?: string;
  sessionId?: string;
  projectId?: string;
  newRole?: "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER";
}

export class LiveRevocationManager {
  private sockets = new Set<ActiveCollabSocket>();
  private socketsByUser = new Map<string, Set<ActiveCollabSocket>>();
  private socketsBySession = new Map<string, Set<ActiveCollabSocket>>();
  private socketsByProject = new Map<string, Set<ActiveCollabSocket>>();

  constructor(private readonly ticketStore?: TicketStore) {}

  registerSocket(socket: ActiveCollabSocket): () => void {
    this.sockets.add(socket);

    if (!this.socketsByUser.has(socket.userId)) this.socketsByUser.set(socket.userId, new Set());
    this.socketsByUser.get(socket.userId)!.add(socket);

    if (!this.socketsBySession.has(socket.sessionId)) this.socketsBySession.set(socket.sessionId, new Set());
    this.socketsBySession.get(socket.sessionId)!.add(socket);

    if (!this.socketsByProject.has(socket.projectId)) this.socketsByProject.set(socket.projectId, new Set());
    this.socketsByProject.get(socket.projectId)!.add(socket);

    return () => {
      this.unregisterSocket(socket);
    };
  }

  unregisterSocket(socket: ActiveCollabSocket): void {
    this.sockets.delete(socket);
    this.socketsByUser.get(socket.userId)?.delete(socket);
    this.socketsBySession.get(socket.sessionId)?.delete(socket);
    this.socketsByProject.get(socket.projectId)?.delete(socket);
  }

  async handleRevocation(event: RevocationEvent): Promise<number> {
    let affectedCount = 0;

    if (event.type === "session_revoked" && event.sessionId) {
      if (this.ticketStore) {
        await this.ticketStore.invalidateSession(event.sessionId);
      }
      const set = this.socketsBySession.get(event.sessionId);
      if (set) {
        for (const sock of Array.from(set)) {
          sock.send(JSON.stringify({ type: "revocation", reason: "SESSION_REVOKED" }));
          sock.close(4401, "SESSION_REVOKED");
          this.unregisterSocket(sock);
          affectedCount++;
        }
      }
    } else if (event.type === "member_removed" && event.userId && event.projectId) {
      if (this.ticketStore) {
        await this.ticketStore.invalidateUser(event.userId);
      }
      const set = this.socketsByUser.get(event.userId);
      if (set) {
        for (const sock of Array.from(set)) {
          if (sock.projectId === event.projectId) {
            sock.send(JSON.stringify({ type: "revocation", reason: "MEMBER_REMOVED" }));
            sock.close(4403, "MEMBER_REMOVED");
            this.unregisterSocket(sock);
            affectedCount++;
          }
        }
      }
    } else if (event.type === "role_changed" && event.userId && event.projectId) {
      const set = this.socketsByUser.get(event.userId);
      if (set) {
        for (const sock of Array.from(set)) {
          if (sock.projectId === event.projectId) {
            if (event.newRole === "VIEWER" || event.newRole === "REVIEWER") {
              // Downgrade action to read-only or terminate write socket
              sock.action = "read";
              sock.setRole?.(event.newRole);
              sock.send(
                JSON.stringify({
                  type: "role_updated",
                  newRole: event.newRole,
                  action: "read",
                  message: "Role demoted to read-only.",
                }),
              );
              affectedCount++;
            }
          }
        }
      }
    }

    return affectedCount;
  }

  getActiveSocketCount(): number {
    return this.sockets.size;
  }
}
