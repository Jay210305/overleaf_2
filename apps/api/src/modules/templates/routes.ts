import type { FastifyInstance, FastifyReply } from "fastify";
import {
  templateDetailViewSchema,
  templateInstantiateSchema,
  templateViewSchema,
  type TemplateInstantiationView,
} from "@latex-collab/contracts";
import type { DatabaseClient } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import { getTemplate, listTemplates } from "./catalog.js";
import { instantiateTemplate } from "./instantiate.js";

function handleTemplateError(error: unknown, reply: FastifyReply, requestId: string) {
  if (error instanceof AuthError) {
    return reply
      .code(error.status)
      .type("application/problem+json")
      .send(problem(error.status, error.code, requestId));
  }
  return reply
    .code(503)
    .type("application/problem+json")
    .send(problem(503, "SERVICE_UNAVAILABLE", requestId));
}

/**
 * Versioned internal-template catalogue. Any authenticated actor may list
 * and instantiate; instantiation always creates a member-free project owned
 * solely by the requester, so no external authorization is ever copied.
 */
export function registerTemplateRoutes(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined },
): void {
  app.get("/api/v1/templates", { config: { sessionOnly: true } }, async (request, reply) => {
    try {
      if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const identity = request.sessionIdentity as { userId: string } | undefined;
      if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
      const { category } = request.query as { category?: unknown };
      if (category !== undefined && (typeof category !== "string" || category.length > 64)) {
        throw new AuthError(400, "VALIDATION_ERROR");
      }
      const templates = listTemplates(
        typeof category === "string" && category.length > 0 ? category : undefined,
      ).map((template) =>
        templateViewSchema.parse({
          id: template.id,
          title: template.title,
          category: template.category,
          description: template.description,
          version: template.version,
          manifestHash: template.manifestHash,
          mainPath: template.mainPath,
          files: template.files,
        }),
      );
      return reply.code(200).type("application/json").send({ templates });
    } catch (error) {
      return handleTemplateError(error, reply, request.id);
    }
  });

  app.get(
    "/api/v1/templates/:templateId",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = request.sessionIdentity as { userId: string } | undefined;
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const { templateId } = request.params as { templateId: string };
        if (typeof templateId !== "string" || templateId.length === 0 || templateId.length > 64) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }
        const template = getTemplate(templateId);
        if (!template) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        // Internal sources are identical for every actor, so the detail is
        // safe to serve to any authenticated session; per-project binaries
        // are never part of a template and stay behind their own READ gates.
        return reply
          .code(200)
          .type("application/json")
          .send(
            templateDetailViewSchema.parse({
              id: template.id,
              title: template.title,
              category: template.category,
              description: template.description,
              version: template.version,
              manifestHash: template.manifestHash,
              mainPath: template.mainPath,
              files: template.files,
              contents: template.filesWithContent.map((file) => ({
                path: file.path,
                content: file.content,
              })),
            }),
          );
      } catch (error) {
        return handleTemplateError(error, reply, request.id);
      }
    },
  );

  app.post(
    "/api/v1/templates/:templateId/instantiate",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = request.sessionIdentity as { userId: string } | undefined;
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        const { templateId } = request.params as { templateId: string };
        if (typeof templateId !== "string" || templateId.length === 0 || templateId.length > 64) {
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        }
        const template = getTemplate(templateId);
        if (!template) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        const parsed = templateInstantiateSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
        const { projectId, mainFileId } = await instantiateTemplate(
          options.db,
          identity.userId,
          template,
          parsed.data.title,
        );
        const created = await options.db.query<{ title: string }>(
          "SELECT title FROM projects WHERE id = $1",
          [projectId],
        );
        const view: TemplateInstantiationView = {
          id: projectId,
          title: created.rows[0]!.title,
          templateId: template.id,
          templateVersion: template.version,
          mainFileId,
        };
        return reply.code(201).type("application/json").send(view);
      } catch (error) {
        return handleTemplateError(error, reply, request.id);
      }
    },
  );
}
