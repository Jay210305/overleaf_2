import type { DatabaseClient } from "@latex-collab/db";
import type { CollabTicketData, TicketStore } from "./ticket.js";
import { validateAndConsumeTicket, type ValidateTicketResult } from "./ticket.js";

export interface AuthenticateConnectionInput {
  ticket: string;
  origin?: string | undefined;
  allowedOrigin?: string | undefined;
  expectedProjectId?: string | undefined;
  expectedFileId?: string | undefined;
}

export interface AuthenticatedUserContext {
  userId: string;
  projectId: string;
  fileId: string;
  action: "read" | "write";
  sessionId: string;
  roomId: string;
  role: string;
}

export class AuthenticationError extends Error {
  constructor(
    public readonly code:
      | "AUTHENTICATION_FAILED"
      | "TICKET_INVALID_OR_EXPIRED"
      | "ORIGIN_NOT_ALLOWED"
      | "PERMISSION_DENIED"
      | "RESOURCE_NOT_FOUND"
      | "MEMBERSHIP_REVOKED"
      | "ROOM_MISMATCH",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AuthenticationError";
  }
}

/**
 * Validates the initial protocol authentication message before any manuscript
 * text or room content is read or sent to the client.
 */
export async function authenticateConnection(
  input: AuthenticateConnectionInput,
  ticketStore: TicketStore,
  db?: DatabaseClient,
): Promise<AuthenticatedUserContext> {
  const result: ValidateTicketResult = await validateAndConsumeTicket({
    ticket: input.ticket,
    origin: input.origin,
    allowedOrigin: input.allowedOrigin,
    ticketStore,
    db,
  });

  if (!result.ok) {
    switch (result.error) {
      case "ORIGIN_NOT_ALLOWED":
        throw new AuthenticationError(
          "ORIGIN_NOT_ALLOWED",
          "Origin header does not match allowed origin",
        );
      case "TICKET_MISSING":
      case "TICKET_INVALID_OR_EXPIRED":
        throw new AuthenticationError(
          "TICKET_INVALID_OR_EXPIRED",
          "Ticket is missing, invalid, expired or already consumed",
        );
      case "MEMBERSHIP_REVOKED":
        throw new AuthenticationError(
          "MEMBERSHIP_REVOKED",
          "User membership is no longer active in project",
        );
      case "PERMISSION_DENIED":
        throw new AuthenticationError(
          "PERMISSION_DENIED",
          "Insufficient permissions for requested action",
        );
      case "RESOURCE_NOT_FOUND":
        throw new AuthenticationError("RESOURCE_NOT_FOUND", "Project or file not found or deleted");
      default:
        throw new AuthenticationError("AUTHENTICATION_FAILED", "Authentication failed");
    }
  }

  const data: CollabTicketData = result.data;

  // If the client requested to connect to a specific room, verify it matches the ticket scope
  if (input.expectedProjectId && input.expectedProjectId !== data.projectId) {
    throw new AuthenticationError("ROOM_MISMATCH", "Ticket project scope does not match room");
  }
  if (input.expectedFileId && input.expectedFileId !== data.fileId) {
    throw new AuthenticationError("ROOM_MISMATCH", "Ticket file scope does not match room");
  }

  const roomId = `project:${data.projectId}:file:${data.fileId}`;

  // Fetch actual role if db provided, else infer from action
  let role = data.action === "write" ? "EDITOR" : "VIEWER";
  if (db) {
    const projRes = await db.query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1`,
      [data.projectId],
    );
    if (projRes.rows[0]?.owner_id === data.userId) {
      role = "OWNER";
    } else {
      const memberRes = await db.query<{ role: string }>(
        `SELECT role FROM active_project_members WHERE project_id = $1 AND user_id = $2`,
        [data.projectId, data.userId],
      );
      if (memberRes.rows[0]) {
        role = memberRes.rows[0].role;
      }
    }
  }

  return {
    userId: data.userId,
    projectId: data.projectId,
    fileId: data.fileId,
    action: data.action,
    sessionId: data.sessionId,
    roomId,
    role,
  };
}
