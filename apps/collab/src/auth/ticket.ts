import { createHash, randomBytes } from "node:crypto";
import { isOriginAllowed } from "@latex-collab/config/server";
import type { DatabaseClient } from "@latex-collab/db";
import type { TicketView } from "@latex-collab/contracts";

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

export const globalMemoryTicketStore = new MemoryTicketStore();

export interface ValidateTicketOptions {
  ticket: string;
  origin?: string | undefined;
  allowedOrigin?: string | readonly string[] | undefined;
  ticketStore: TicketStore;
  db?: DatabaseClient | undefined;
}

export type ValidateTicketResult =
  | { ok: true; data: CollabTicketData }
  | {
      ok: false;
      error:
        | "TICKET_MISSING"
        | "TICKET_INVALID_OR_EXPIRED"
        | "ORIGIN_NOT_ALLOWED"
        | "MEMBERSHIP_REVOKED"
        | "PERMISSION_DENIED"
        | "RESOURCE_NOT_FOUND";
      detail?: string;
    };

/**
 * Validates and atomically consumes a single-use WSS collaboration ticket.
 * Enforces:
 * 1. Origin header checking against allowed application origin.
 * 2. Atomic single-use consumption (preventing replay attacks).
 * 3. Expiry verification (30-second TTL).
 * 4. Live database membership & role verification.
 */
export async function validateAndConsumeTicket(
  options: ValidateTicketOptions,
): Promise<ValidateTicketResult> {
  const { ticket, origin, allowedOrigin, ticketStore, db } = options;

  if (!ticket || typeof ticket !== "string" || ticket.trim().length === 0) {
    return { ok: false, error: "TICKET_MISSING" };
  }

  // 1. Origin check
  if (allowedOrigin) {
    if (!origin) {
      return { ok: false, error: "ORIGIN_NOT_ALLOWED" };
    }
    if (!isOriginAllowed(origin, allowedOrigin)) {
      return { ok: false, error: "ORIGIN_NOT_ALLOWED" };
    }
  }

  // 2. Consume ticket atomically from store (replay protection)
  const ticketData = await ticketStore.consumeTicket(ticket.trim());
  if (!ticketData) {
    return { ok: false, error: "TICKET_INVALID_OR_EXPIRED" };
  }

  // 3. Optional live database verification
  if (db) {
    const projRes = await db.query<{ owner_id: string; status: string }>(
      `SELECT owner_id, status FROM projects WHERE id = $1`,
      [ticketData.projectId],
    );
    const proj = projRes.rows[0];
    if (!proj || proj.status === "trashed") {
      return { ok: false, error: "RESOURCE_NOT_FOUND" };
    }

    let role = "OWNER";
    if (proj.owner_id !== ticketData.userId) {
      const memberRes = await db.query<{ role: string }>(
        `SELECT role FROM active_project_members WHERE project_id = $1 AND user_id = $2`,
        [ticketData.projectId, ticketData.userId],
      );
      const member = memberRes.rows[0];
      if (!member) {
        return { ok: false, error: "MEMBERSHIP_REVOKED" };
      }
      role = member.role;
    }

    if (ticketData.action === "write" && (role === "VIEWER" || role === "REVIEWER")) {
      return { ok: false, error: "PERMISSION_DENIED" };
    }

    const fileRes = await db.query<{ id: string; content_kind: string; deleted_at: Date | null }>(
      `SELECT id, content_kind, deleted_at FROM project_nodes WHERE id = $1 AND project_id = $2`,
      [ticketData.fileId, ticketData.projectId],
    );
    const file = fileRes.rows[0];
    if (!file || file.deleted_at !== null) {
      return { ok: false, error: "RESOURCE_NOT_FOUND" };
    }
    if (file.content_kind !== "TEXT") {
      return { ok: false, error: "RESOURCE_NOT_FOUND" };
    }
  }

  return { ok: true, data: ticketData };
}
