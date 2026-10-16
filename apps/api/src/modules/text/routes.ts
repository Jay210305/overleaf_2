import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { applyTextUpdateSchema, type DurableAck } from "@latex-collab/contracts";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import { DefaultTextDocumentService, type TextDocumentService } from "./text-document-service.js";

function handleTextRouteError(error: unknown, reply: FastifyReply, requestId: string) {
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

export function registerTextRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
    service?: TextDocumentService | undefined;
  },
): void {
  const service =
    options.service ?? (options.db ? new DefaultTextDocumentService(options.db) : undefined);

  // 1. GET /api/v1/projects/:projectId/files/:fileId/text - read canonical text state
  app.get(
    "/api/v1/projects/:projectId/files/:fileId/text",
    {
      config: { projectAction: "READ" },
    },
    async (request: FastifyRequest<{ Params: { projectId: string; fileId: string } }>, reply) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, fileId } = request.params;
        if (!isUUID(projectId) || !isUUID(fileId)) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const state = await service.load(projectId, fileId, auth.userId);
        return reply.code(200).type("application/json").send(state);
      } catch (error) {
        return handleTextRouteError(error, reply, request.id);
      }
    },
  );

  // 2. PUT /api/v1/projects/:projectId/files/:fileId/text - apply Yjs update with base state vector check
  app.put(
    "/api/v1/projects/:projectId/files/:fileId/text",
    {
      config: { projectAction: "EDIT" },
    },
    async (
      request: FastifyRequest<{
        Params: { projectId: string; fileId: string };
        Body: { updateBase64: string; baseStateVectorBase64: string };
      }>,
      reply,
    ) => {
      try {
        if (!options.db || !service) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, fileId } = request.params;
        if (!isUUID(projectId) || !isUUID(fileId)) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const auth = request.projectAuthorization;
        if (!auth) throw new AuthError(401, "AUTHENTICATION_REQUIRED");

        const parsedBody = applyTextUpdateSchema.safeParse(request.body);
        if (!parsedBody.success) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const state = await service.apply(projectId, fileId, auth.userId, parsedBody.data);

        const durableAck: DurableAck = {
          type: "text.durable_ack",
          version: 1,
          fileId: state.fileId,
          persistedSeq: state.persistedSeq,
          stateVectorBase64: state.stateVectorBase64,
        };

        return reply
          .code(200)
          .type("application/json")
          .header("x-persisted-seq", String(state.persistedSeq))
          .send({
            ...state,
            ack: durableAck,
          });
      } catch (error) {
        return handleTextRouteError(error, reply, request.id);
      }
    },
  );
}
