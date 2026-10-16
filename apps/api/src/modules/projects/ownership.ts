import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ownershipRequestSchema,
  type OwnershipRequest,
  type OwnershipView,
  type ProjectView,
} from "@latex-collab/contracts";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import { requireSession, type ProjectAuthorization } from "../../plugins/require-session.js";

function handleOwnershipError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  throw error;
}

export class OwnershipService {
  constructor(private readonly db: DatabaseClient) {}

  async createOffer(
    projectId: string,
    currentOwnerId: string,
    input: OwnershipRequest,
  ): Promise<OwnershipView> {
    if (input.recipientUserId === currentOwnerId) {
      // Sole owner cannot abandon or transfer to themselves
      throw new AuthError(400, "VALIDATION_ERROR");
    }

    // Verify recipient user exists
    const userRes = await this.db.query<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [
      input.recipientUserId,
    ]);
    if (userRes.rows.length === 0) {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }

    // Cancel any previous pending offers for this project
    await this.db.query(
      `UPDATE project_ownership_offers
       SET status = 'cancelled'
       WHERE project_id = $1 AND status = 'pending'`,
      [projectId],
    );

    // Create new offer valid for 7 days
    const res = await this.db.query<{
      id: string;
      project_id: string;
      recipient_user_id: string;
      status: "pending" | "accepted" | "rejected" | "cancelled";
      expires_at: Date;
    }>(
      `INSERT INTO project_ownership_offers (
         project_id, owner_id, recipient_user_id, status, expires_at
       )
       VALUES ($1, $2, $3, 'pending', NOW() + INTERVAL '7 days')
       RETURNING id, project_id, recipient_user_id, status, expires_at`,
      [projectId, currentOwnerId, input.recipientUserId],
    );

    const row = res.rows[0]!;
    return {
      id: row.id,
      projectId: row.project_id,
      recipientUserId: row.recipient_user_id,
      expiresAt: row.expires_at.toISOString(),
      status: row.status,
    };
  }

  async acceptOffer(offerId: string, recipientUserId: string): Promise<ProjectView> {
    return this.db.transaction(async (tx) => {
      // 1. Lock and retrieve offer
      const offerRes = await tx.query<{
        id: string;
        project_id: string;
        owner_id: string;
        recipient_user_id: string;
        status: string;
        expires_at: Date;
      }>(
        `SELECT id, project_id, owner_id, recipient_user_id, status, expires_at
         FROM project_ownership_offers
         WHERE id = $1
         FOR UPDATE`,
        [offerId],
      );

      const offer = offerRes.rows[0];
      if (!offer) {
        throw new AuthError(404, "RESOURCE_NOT_FOUND");
      }

      if (offer.recipient_user_id !== recipientUserId) {
        throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
      }

      if (offer.status !== "pending") {
        throw new AuthError(409, "OFFER_CONFLICT");
      }

      if (new Date(offer.expires_at) < new Date()) {
        throw new AuthError(410, "OFFER_EXPIRED");
      }

      // 2. Lock and update project
      const projRes = await tx.query<{
        id: string;
        owner_id: string;
        title: string;
        description: string | null;
        main_file_id: string | null;
        compiler: ProjectView["compiler"];
        status: ProjectView["status"];
        current_revision: number;
        created_at: Date;
        updated_at: Date;
      }>(
        `UPDATE projects
         SET owner_id = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, owner_id, title, description, main_file_id, compiler, status, current_revision, created_at, updated_at`,
        [recipientUserId, offer.project_id],
      );

      const project = projRes.rows[0];
      if (!project) {
        throw new AuthError(404, "RESOURCE_NOT_FOUND");
      }

      // 3. Former owner is retained as EDITOR in project_members
      await tx.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'EDITOR')
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET role = 'EDITOR', revoked_at = NULL`,
        [offer.project_id, offer.owner_id],
      );

      // 4. Remove new owner from project_members since they are now the owner
      await tx.query(
        `DELETE FROM project_members
         WHERE project_id = $1 AND user_id = $2`,
        [offer.project_id, recipientUserId],
      );

      // 5. Mark offer as accepted
      await tx.query(
        `UPDATE project_ownership_offers
         SET status = 'accepted'
         WHERE id = $1`,
        [offerId],
      );

      return {
        id: project.id,
        ownerId: project.owner_id,
        title: project.title,
        description: project.description,
        mainFileId: project.main_file_id,
        compiler: project.compiler,
        status: project.status,
        currentRevision: Number(project.current_revision),
        createdAt: project.created_at.toISOString(),
        updatedAt: project.updated_at.toISOString(),
      };
    });
  }

  async cancelOffer(projectId: string, ownerId: string, offerId: string): Promise<void> {
    const res = await this.db.query(
      `UPDATE project_ownership_offers
       SET status = 'cancelled'
       WHERE id = $1 AND project_id = $2 AND owner_id = $3 AND status = 'pending'`,
      [offerId, projectId, ownerId],
    );

    if (res.rowCount === 0) {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }
  }
}

export function registerOwnershipRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
    service?: OwnershipService | undefined;
  },
): void {
  const service = options.service ?? (options.db ? new OwnershipService(options.db) : undefined);
  const secureCookies = options.secureCookies ?? options.origin?.startsWith("https://") ?? false;

  // 1. POST /api/v1/projects/:projectId/ownership - create transfer offer
  app.post(
    "/api/v1/projects/:projectId/ownership",
    {
      config: { projectAction: "TRANSFER" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Body: OwnershipRequest;
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization as ProjectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const parsed = ownershipRequestSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const offer = await service.createOffer(projectId, auth.userId, parsed.data);
        return reply.code(201).type("application/json").send(offer);
      } catch (error) {
        return handleOwnershipError(error, reply, request.id);
      }
    },
  );

  // 2. POST /api/v1/ownership/:offerId/accept - recipient accepts offer
  app.post(
    "/api/v1/ownership/:offerId/accept",
    async (request: FastifyRequest<{ Params: { offerId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { offerId } = request.params;
        if (!isUUID(offerId)) throw new AuthError(400, "VALIDATION_ERROR");

        const identity = await requireSession(
          options.db,
          request,
          options.origin,
          secureCookies,
          true,
        );

        const project = await service.acceptOffer(offerId, identity.userId);
        return reply.code(200).type("application/json").send(project);
      } catch (error) {
        return handleOwnershipError(error, reply, request.id);
      }
    },
  );

  // 3. DELETE /api/v1/projects/:projectId/ownership/:offerId - cancel offer
  app.delete(
    "/api/v1/projects/:projectId/ownership/:offerId",
    {
      config: { projectAction: "TRANSFER" },
    },
    async (request: FastifyRequest<{ Params: { projectId: string; offerId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, offerId } = request.params;
        if (!isUUID(projectId) || !isUUID(offerId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization as ProjectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        await service.cancelOffer(projectId, auth.userId, offerId);
        return reply.code(204).send();
      } catch (error) {
        return handleOwnershipError(error, reply, request.id);
      }
    },
  );
}
