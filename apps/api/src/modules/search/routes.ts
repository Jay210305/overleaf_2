import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  replaceRequestSchema,
  replaceResultSchema,
  searchViewSchema,
  type ReplaceRequest,
  type ReplaceResult,
  type SearchMatch,
  type SearchView,
} from "@latex-collab/contracts";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";
import { problem } from "../../plugins/errors.js";

const searchQuerySchema = z.object({
  q: z.string().min(1).max(10000),
  regex: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => val === true || val === "true")
    .default(false),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// In-memory text storage helper for test decoupling and active sessions
const projectFileTextStore = new Map<string, Map<string, string>>();

export function setProjectFileText(projectId: string, fileId: string, text: string): void {
  let projectMap = projectFileTextStore.get(projectId);
  if (!projectMap) {
    projectMap = new Map();
    projectFileTextStore.set(projectId, projectMap);
  }
  projectMap.set(fileId, text);
}

export function getProjectFileText(projectId: string, fileId: string): string | undefined {
  return projectFileTextStore.get(projectId)?.get(fileId);
}

/**
 * Validates regex against ReDoS vulnerabilities (safe regex limits).
 */
export function validateSafeRegex(pattern: string): RegExp {
  if (pattern.length > 200) {
    throw new Error("Regular expression exceeds maximum allowed length of 200 characters");
  }
  // Check for dangerous nested quantifiers like (a+)+, (a*)*, (.*)*
  if (/(\([^)]*[\+\*]\)[*+])|(\[[^\]]*[\+\*]\][*+])/.test(pattern)) {
    throw new Error(
      "Potentially catastrophic exponential backtracking detected in regular expression",
    );
  }

  try {
    return new RegExp(pattern, "g");
  } catch (err: unknown) {
    throw new Error(`Invalid regular expression syntax: ${(err as Error).message}`);
  }
}

export function registerSearchRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    storage?: StorageAdapter | undefined;
  },
): void {
  // 1. GET /api/v1/projects/:projectId/search
  app.get(
    "/api/v1/projects/:projectId/search",
    { config: { projectAction: "READ" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { projectId } = request.params as { projectId: string };
      if (!isUUID(projectId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const parseQuery = searchQuerySchema.safeParse(request.query);
      if (!parseQuery.success) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const { q, regex, limit, cursor } = parseQuery.data;

      let matcher: RegExp;
      try {
        if (regex) {
          matcher = validateSafeRegex(q);
        } else {
          // Literal case-insensitive search
          const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          matcher = new RegExp(escaped, "gi");
        }
      } catch {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const matches: SearchMatch[] = [];

      if (options.db) {
        const { rows: textNodes } = await options.db.query<{
          id: string;
          name: string;
          blob_key: string | null;
        }>(
          `SELECT id, name, blob_key FROM project_nodes WHERE project_id = $1 AND kind = 'FILE' AND deleted_at IS NULL`,
          [projectId],
        );

        for (const node of textNodes) {
          let content = getProjectFileText(projectId, node.id);
          if (content === undefined && node.blob_key && options.storage) {
            try {
              const raw = await options.storage.get(node.blob_key);
              content = Buffer.from(raw).toString("utf-8");
            } catch {
              content = "";
            }
          }
          if (!content) continue;

          const lines = content.split(/\r?\n/);
          for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx]!;
            matcher.lastIndex = 0;
            if (matcher.test(line)) {
              matches.push({
                fileId: node.id,
                path: node.name,
                line: idx + 1,
                text: line,
              });
            }
          }
        }
      } else {
        // Fallback using in-memory store
        const filesMap = projectFileTextStore.get(projectId);
        if (filesMap) {
          for (const [fileId, content] of filesMap.entries()) {
            const lines = content.split(/\r?\n/);
            for (let idx = 0; idx < lines.length; idx++) {
              const line = lines[idx]!;
              matcher.lastIndex = 0;
              if (matcher.test(line)) {
                matches.push({
                  fileId,
                  path: `file-${fileId}.tex`,
                  line: idx + 1,
                  text: line,
                });
              }
            }
          }
        }
      }

      // Cursor-based pagination
      const startIndex = cursor ? parseInt(cursor, 10) || 0 : 0;
      const paginated = matches.slice(startIndex, startIndex + limit);
      const nextIndex = startIndex + limit < matches.length ? String(startIndex + limit) : null;

      const result: SearchView = {
        items: paginated,
        nextCursor: nextIndex,
      };

      return reply.code(200).send(searchViewSchema.parse(result));
    },
  );

  // 2. POST /api/v1/projects/:projectId/search/replace
  app.post(
    "/api/v1/projects/:projectId/search/replace",
    { config: { projectAction: "EDIT" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { projectId } = request.params as { projectId: string };
      if (!isUUID(projectId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const parseResult = replaceRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const body: ReplaceRequest = parseResult.data;

      // Optimistic concurrency version guard (EDT-08)
      if (options.db) {
        const { rows: projRows } = await options.db.query<{ current_revision: number }>(
          `SELECT current_revision FROM projects WHERE id = $1`,
          [projectId],
        );
        const project = projRows[0];
        if (!project) {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
        }

        if (project.current_revision !== body.expectedRevision) {
          return reply
            .code(409)
            .type("application/problem+json")
            .send(problem(409, "STALE_REVISION_CONFLICT", request.id));
        }
      }

      let matcher: RegExp;
      try {
        if (body.regex) {
          matcher = validateSafeRegex(body.query);
        } else {
          const escaped = body.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          matcher = new RegExp(escaped, "g");
        }
      } catch {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      let replacementsCount = 0;
      const projectMap = projectFileTextStore.get(projectId);

      if (projectMap) {
        for (const [fileId, text] of projectMap.entries()) {
          if (body.fileIds && !body.fileIds.includes(fileId)) {
            continue;
          }
          const matches = text.match(matcher);
          if (matches) {
            replacementsCount += matches.length;
            const updated = text.replace(matcher, body.replacement);
            projectMap.set(fileId, updated);
          }
        }
      } else if (options.db) {
        const { rows: textNodes } = await options.db.query<{
          id: string;
          name: string;
          blob_key: string | null;
        }>(
          `SELECT id, name, blob_key FROM project_nodes WHERE project_id = $1 AND kind = 'FILE' AND deleted_at IS NULL`,
          [projectId],
        );
        for (const node of textNodes) {
          if (body.fileIds && !body.fileIds.includes(node.id)) {
            continue;
          }
          let text = getProjectFileText(projectId, node.id);
          if (text === undefined && node.blob_key && options.storage) {
            try {
              const raw = await options.storage.get(node.blob_key);
              text = Buffer.from(raw).toString("utf-8");
            } catch {
              text = "";
            }
          }
          if (!text) continue;
          const matches = text.match(matcher);
          if (matches) {
            replacementsCount += matches.length;
            const updated = text.replace(matcher, body.replacement);
            setProjectFileText(projectId, node.id, updated);
            if (options.storage) {
              const buf = Buffer.from(updated, "utf-8");
              const newKey = `projects/${projectId}/files/${node.id}-${randomUUID()}`;
              await options.storage.put(newKey, buf, "text/x-tex");
              await options.db.query(
                `UPDATE project_nodes SET blob_key = $1, size_bytes = $2 WHERE id = $3`,
                [newKey, buf.byteLength, node.id],
              );
            }
          }
        }
        if (replacementsCount > 0) {
          await options.db.query(
            `UPDATE projects SET current_revision = current_revision + 1 WHERE id = $1`,
            [projectId],
          );
        }
      }

      const newRevisionId = randomUUID();

      const result: ReplaceResult = {
        newRevisionId,
        replacements: replacementsCount,
      };

      return reply.code(200).send(replaceResultSchema.parse(result));
    },
  );
}
