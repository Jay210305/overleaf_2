import type { FastifyInstance } from "fastify";
import {
  updateProjectSettingsSchema,
  type ProjectSettingsView,
  type Compiler,
} from "@latex-collab/contracts";
import { DatabaseClient, isUUID } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";
import { parseIfMatch } from "./validation.js";

const ALLOWED_COMPILERS = new Set<Compiler>(["pdflatex", "xelatex", "lualatex", "latex"]);

export function registerProjectSettingsRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
  },
): void {
  // 1. GET /api/v1/projects/:projectId/settings
  app.get(
    "/api/v1/projects/:projectId/settings",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params as { projectId: string };

        const projRes = await options.db.query<{
          id: string;
          main_file_id: string | null;
          compiler: Compiler;
          texlive_image_version: string;
        }>(
          `SELECT id, main_file_id, compiler, texlive_image_version
           FROM projects
           WHERE id = $1`,
          [projectId],
        );
        const proj = projRes.rows[0];
        if (!proj) throw new AuthError(404, "RESOURCE_NOT_FOUND");

        const settingsView: ProjectSettingsView = {
          projectId: proj.id,
          mainFileId: proj.main_file_id,
          compiler: proj.compiler,
          texliveImageVersion: proj.texlive_image_version,
          autoCompile: false,
          timeoutSeconds: 30,
        };
        return settingsView;
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

  // 2. PATCH /api/v1/projects/:projectId/settings
  app.patch(
    "/api/v1/projects/:projectId/settings",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId } = request.params as { projectId: string };

        const parsed = updateProjectSettingsSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new AuthError(400, "VALIDATION_ERROR");
        }

        const ifMatchHeader = request.headers["if-match"];
        const ifMatch = ifMatchHeader !== undefined ? parseIfMatch(ifMatchHeader) : null;

        const updatedSettings = await options.db.transaction(async (tx) => {
          // 1. Lock project
          const projRes = await tx.query<{
            id: string;
            main_file_id: string | null;
            compiler: Compiler;
            texlive_image_version: string;
            current_revision: number;
          }>(
            `SELECT id, main_file_id, compiler, texlive_image_version, current_revision
             FROM projects
             WHERE id = $1 FOR UPDATE`,
            [projectId],
          );
          const current = projRes.rows[0];
          if (!current) throw new AuthError(404, "RESOURCE_NOT_FOUND");
          const currentRev = Number(current.current_revision);

          if (ifMatch !== null && currentRev !== ifMatch) {
            throw new AuthError(412, "PRECONDITION_FAILED");
          }

          let newMainFileId = current.main_file_id;
          if (parsed.data.mainFileId !== undefined) {
            if (parsed.data.mainFileId !== null) {
              if (!isUUID(parsed.data.mainFileId)) {
                throw new AuthError(400, "VALIDATION_ERROR");
              }
              // PRO-07: Verify target node exists in same project, is active, kind is FILE, and name ends with .tex
              const nodeRes = await tx.query<{ id: string; name: string; kind: string }>(
                `SELECT id, name, kind FROM project_nodes
                 WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
                [parsed.data.mainFileId, projectId],
              );
              const node = nodeRes.rows[0];
              if (!node) {
                // If node is foreign or doesn't exist, anti-enumeration / validation
                throw new AuthError(400, "VALIDATION_ERROR");
              }
              if (node.kind !== "FILE" || !node.name.toLowerCase().endsWith(".tex")) {
                throw new AuthError(400, "VALIDATION_ERROR");
              }
              newMainFileId = node.id;
            } else {
              newMainFileId = null;
            }
          }

          let newCompiler = current.compiler;
          if (parsed.data.compiler !== undefined) {
            if (!ALLOWED_COMPILERS.has(parsed.data.compiler)) {
              throw new AuthError(400, "VALIDATION_ERROR");
            }
            newCompiler = parsed.data.compiler;
          }

          const newTexlive = parsed.data.texliveImageVersion ?? current.texlive_image_version;
          const newRev = currentRev + 1;

          await tx.query(
            `UPDATE projects
             SET main_file_id = $1, compiler = $2, texlive_image_version = $3,
                 current_revision = $4, updated_at = now()
             WHERE id = $5`,
            [newMainFileId, newCompiler, newTexlive, newRev, projectId],
          );

          const result: ProjectSettingsView = {
            projectId,
            mainFileId: newMainFileId,
            compiler: newCompiler,
            texliveImageVersion: newTexlive,
            autoCompile: parsed.data.autoCompile ?? false,
            timeoutSeconds: parsed.data.timeoutSeconds ?? 30,
          };
          return result;
        });

        return reply.code(200).send(updatedSettings);
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
