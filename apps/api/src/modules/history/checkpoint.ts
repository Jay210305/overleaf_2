import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createCheckpointSchema, type CreateCheckpointInput } from "@latex-collab/contracts";
import {
  DatabaseClient,
  RevisionsRepository,
  type StructuralRevisionRecord,
  isUUID,
} from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

export class CheckpointService {
  private readonly revisionsRepo: RevisionsRepository;

  constructor(private readonly db: DatabaseClient) {
    this.revisionsRepo = new RevisionsRepository(db);
  }

  private async checkProjectAccess(
    projectId: string,
    actorId: string,
    requiredAction: "READ" | "EDIT",
  ): Promise<{ ownerId: string; role: string }> {
    const projRes = await this.db.query<{ owner_id: string; status: string }>(
      `SELECT owner_id, status FROM projects WHERE id = $1`,
      [projectId],
    );
    const proj = projRes.rows[0];
    if (!proj || proj.status === "trashed") {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }

    if (proj.owner_id === actorId) {
      return { ownerId: proj.owner_id, role: "OWNER" };
    }

    const memberRes = await this.db.query<{ role: string }>(
      `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, actorId],
    );
    const member = memberRes.rows[0];
    if (!member) {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }

    if (requiredAction === "EDIT" && (member.role === "VIEWER" || member.role === "REVIEWER")) {
      throw new AuthError(403, "PROJECT_PERMISSION_DENIED");
    }

    return { ownerId: proj.owner_id, role: member.role };
  }

  /**
   * Creates an explicit immutable checkpoint capturing the current project tree and text/binary hashes.
   * Invariant: Explicit save/compile checkpoint includes text and binary hashes without creating one full revision per keystroke.
   */
  async createCheckpoint(
    projectId: string,
    actorId: string,
    input: CreateCheckpointInput,
  ): Promise<StructuralRevisionRecord> {
    await this.checkProjectAccess(projectId, actorId, "EDIT");

    return await this.revisionsRepo.createStructuralRevision({
      projectId,
      authorId: actorId,
      source: input.source || "manual",
      label: input.label ?? null,
    });
  }

  async getCheckpoint(
    projectId: string,
    revisionNo: number,
    actorId: string,
  ): Promise<StructuralRevisionRecord> {
    await this.checkProjectAccess(projectId, actorId, "READ");

    const record = await this.revisionsRepo.getRevision(projectId, revisionNo);
    if (!record) {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }
    return record;
  }

  async listCheckpoints(
    projectId: string,
    actorId: string,
  ): Promise<
    Array<{
      id: string;
      revisionNo: number;
      manifestKey: string;
      manifestHash: string;
      authorId: string | null;
      source: string;
      label: string | null;
      createdAt: string;
    }>
  > {
    await this.checkProjectAccess(projectId, actorId, "READ");

    const res = await this.db.query<{
      id: string;
      revision_no: number;
      manifest_key: string;
      manifest_hash: string;
      author_id: string | null;
      source: string;
      label: string | null;
      created_at: Date;
    }>(
      `SELECT id, revision_no, manifest_key, manifest_hash, author_id, source, label, created_at
       FROM project_revisions
       WHERE project_id = $1
       ORDER BY revision_no DESC`,
      [projectId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      revisionNo: Number(r.revision_no),
      manifestKey: r.manifest_key,
      manifestHash: r.manifest_hash,
      authorId: r.author_id,
      source: r.source,
      label: r.label,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async compareCheckpoints(
    projectId: string,
    baseRevisionNo: number,
    targetRevisionNo: number,
    actorId: string,
  ) {
    await this.checkProjectAccess(projectId, actorId, "READ");
    try {
      return await this.revisionsRepo.compareRevisions(projectId, baseRevisionNo, targetRevisionNo);
    } catch {
      throw new AuthError(404, "RESOURCE_NOT_FOUND");
    }
  }
}

function handleCheckpointError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  const pgCode = (error as { code?: string }).code;
  if (pgCode === "23505") {
    return reply
      .code(409)
      .type("application/problem+json")
      .send(problem(409, "REVISION_CONFLICT", requestId));
  }
  if (pgCode === "23503") {
    return reply
      .code(404)
      .type("application/problem+json")
      .send(problem(404, "RESOURCE_NOT_FOUND", requestId));
  }
  throw error;
}

export function registerCheckpointRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    service?: CheckpointService | undefined;
  },
): void {
  const service = options.service ?? (options.db ? new CheckpointService(options.db) : undefined);

  // 1. POST /api/v1/projects/:projectId/checkpoints - create explicit checkpoint
  app.post(
    "/api/v1/projects/:projectId/checkpoints",
    {
      config: { projectAction: "EDIT" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Body: CreateCheckpointInput;
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const parsed = createCheckpointSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");

        const checkpoint = await service.createCheckpoint(projectId, auth.userId, parsed.data);
        return reply.code(201).type("application/json").send(checkpoint);
      } catch (error) {
        return handleCheckpointError(error, reply, request.id);
      }
    },
  );

  // 2. GET /api/v1/projects/:projectId/checkpoints - list checkpoints
  app.get(
    "/api/v1/projects/:projectId/checkpoints",
    {
      config: { projectAction: "READ" },
    },
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const list = await service.listCheckpoints(projectId, auth.userId);
        return reply.code(200).type("application/json").send(list);
      } catch (error) {
        return handleCheckpointError(error, reply, request.id);
      }
    },
  );

  // 3. GET /api/v1/projects/:projectId/checkpoints/compare - compare two checkpoints
  app.get(
    "/api/v1/projects/:projectId/checkpoints/compare",
    {
      config: { projectAction: "READ" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string };
        Querystring: { base: string; target: string };
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const baseNo = parseInt(request.query.base, 10);
        const targetNo = parseInt(request.query.target, 10);
        if (isNaN(baseNo) || isNaN(targetNo) || baseNo < 0 || targetNo < 0) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const diff = await service.compareCheckpoints(projectId, baseNo, targetNo, auth.userId);
        return reply.code(200).type("application/json").send(diff);
      } catch (error) {
        return handleCheckpointError(error, reply, request.id);
      }
    },
  );

  // 4. GET /api/v1/projects/:projectId/checkpoints/:revisionNo - get single checkpoint
  app.get(
    "/api/v1/projects/:projectId/checkpoints/:revisionNo",
    {
      config: { projectAction: "READ" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string; revisionNo: string };
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, revisionNo: revNoStr } = request.params;
        if (!isUUID(projectId)) throw new AuthError(400, "VALIDATION_ERROR");

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const revisionNo = parseInt(revNoStr, 10);
        if (isNaN(revisionNo) || revisionNo < 0) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const checkpoint = await service.getCheckpoint(projectId, revisionNo, auth.userId);
        return reply.code(200).type("application/json").send(checkpoint);
      } catch (error) {
        return handleCheckpointError(error, reply, request.id);
      }
    },
  );
}
