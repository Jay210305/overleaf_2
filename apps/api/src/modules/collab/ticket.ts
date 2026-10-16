import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseClient } from "@latex-collab/db";
import { isUUID } from "@latex-collab/db";
import { ticketRequestSchema, type TicketView } from "@latex-collab/contracts";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import "../../plugins/require-session.js";

export interface CollabTicketData {
  ticketHash: string;
  userId: string;
  projectId: string;
  fileId: string;
  action: "read" | "write";
  sessionId: string;
  expiresAt: string;
}

export interface TicketStore {
  createTicket(
    data: Omit<CollabTicketData, "ticketHash" | "expiresAt">,
    ttlSeconds?: number,
  ): Promise<TicketView>;
  consumeTicket(ticket: string): Promise<CollabTicketData | null>;
  invalidateUser(userId: string): Promise<void>;
  invalidateSession(sessionId: string): Promise<void>;
  invalidateProject(projectId: string): Promise<void>;
}

export class MemoryTicketStore implements TicketStore {
  private tickets = new Map<string, { data: CollabTicketData; expiresAtMs: number }>();
  private userTickets = new Map<string, Set<string>>();
  private sessionTickets = new Map<string, Set<string>>();
  private projectTickets = new Map<string, Set<string>>();

  async createTicket(
    data: Omit<CollabTicketData, "ticketHash" | "expiresAt">,
    ttlSeconds = 30,
  ): Promise<TicketView> {
    const rawTicket = randomBytes(24).toString("hex");
    const ticketHash = createHash("sha256").update(rawTicket).digest("hex");
    const expiresAtMs = Date.now() + ttlSeconds * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();

    const fullData: CollabTicketData = {
      ...data,
      ticketHash,
      expiresAt,
    };

    this.tickets.set(ticketHash, { data: fullData, expiresAtMs });

    // Track for invalidation
    if (!this.userTickets.has(data.userId)) this.userTickets.set(data.userId, new Set());
    this.userTickets.get(data.userId)!.add(ticketHash);

    if (!this.sessionTickets.has(data.sessionId))
      this.sessionTickets.set(data.sessionId, new Set());
    this.sessionTickets.get(data.sessionId)!.add(ticketHash);

    if (!this.projectTickets.has(data.projectId))
      this.projectTickets.set(data.projectId, new Set());
    this.projectTickets.get(data.projectId)!.add(ticketHash);

    return {
      ticket: rawTicket,
      expiresAt,
    };
  }

  async consumeTicket(ticket: string): Promise<CollabTicketData | null> {
    if (!ticket || typeof ticket !== "string") return null;
    const ticketHash = createHash("sha256").update(ticket).digest("hex");
    const item = this.tickets.get(ticketHash);
    if (!item) return null;

    // Atomically remove so it cannot be consumed again
    this.tickets.delete(ticketHash);

    // Clean up indices
    this.userTickets.get(item.data.userId)?.delete(ticketHash);
    this.sessionTickets.get(item.data.sessionId)?.delete(ticketHash);
    this.projectTickets.get(item.data.projectId)?.delete(ticketHash);

    if (Date.now() > item.expiresAtMs) {
      return null; // Expired
    }

    return item.data;
  }

  async invalidateUser(userId: string): Promise<void> {
    const hashes = this.userTickets.get(userId);
    if (hashes) {
      for (const h of hashes) {
        this.tickets.delete(h);
      }
      this.userTickets.delete(userId);
    }
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const hashes = this.sessionTickets.get(sessionId);
    if (hashes) {
      for (const h of hashes) {
        this.tickets.delete(h);
      }
      this.sessionTickets.delete(sessionId);
    }
  }

  async invalidateProject(projectId: string): Promise<void> {
    const hashes = this.projectTickets.get(projectId);
    if (hashes) {
      for (const h of hashes) {
        this.tickets.delete(h);
      }
      this.projectTickets.delete(projectId);
    }
  }
}

// Global shared store instance for processes sharing memory / tests
export const globalMemoryTicketStore = new MemoryTicketStore();

export function registerCollabTicketRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    ticketStore?: TicketStore | undefined;
  },
): void {
  const store = options.ticketStore ?? globalMemoryTicketStore;

  app.post(
    "/api/v1/projects/:projectId/collab-ticket",
    {
      config: { projectAction: "READ" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Body: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");

        const { projectId } = request.params;
        if (!isUUID(projectId)) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        // Parse and validate request body
        const parsed = ticketRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }
        const { fileId, action } = parsed.data;

        // Role check: VIEWER and REVIEWER cannot request write tickets
        if (action === "write") {
          if (auth.role === "VIEWER" || auth.role === "REVIEWER") {
            throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
          }
        }

        // Validate file exists in this project, is not deleted, and is TEXT
        const fileRes = await options.db.query<{
          id: string;
          kind: string;
          content_kind: string;
          deleted_at: Date | null;
        }>(
          `SELECT id, kind, content_kind, deleted_at FROM project_nodes WHERE id = $1 AND project_id = $2`,
          [fileId, projectId],
        );
        const fileNode = fileRes.rows[0];
        if (!fileNode || fileNode.deleted_at !== null) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }
        if (fileNode.content_kind !== "TEXT") {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        // Issue 30-second single-use ticket
        const result = await store.createTicket(
          {
            userId: auth.userId,
            projectId,
            fileId,
            action,
            sessionId: auth.sessionId,
          },
          30,
        );

        return reply.code(200).send(result);
      } catch (error) {
        if (error instanceof AuthError) {
          return reply
            .code(error.status)
            .type("application/problem+json")
            .send(problem(error.status, error.code, request.id));
        }
        throw error;
      }
    },
  );
}
