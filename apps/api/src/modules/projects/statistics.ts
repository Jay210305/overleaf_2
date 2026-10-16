import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { statisticsSchema, type StatisticsView } from "@latex-collab/contracts";
import { CompilationsRepository, DatabaseClient, isUUID } from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";

interface ProjectNodeRow {
  id: string;
  name: string;
  kind: string;
  size_bytes: string | number | null;
  deleted_at: Date | null;
}

export function registerProjectStatisticsRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
  },
): void {
  // GET /api/v1/projects/:projectId/statistics
  app.get(
    "/api/v1/projects/:projectId/statistics",
    { config: { projectAction: "READ" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { projectId } = request.params as { projectId: string };
      if (!isUUID(projectId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      if (!options.db) {
        return reply
          .code(503)
          .type("application/problem+json")
          .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }

      const projRes = await options.db.query<{ id: string }>(
        `SELECT id FROM projects WHERE id = $1`,
        [projectId],
      );
      if (projRes.rows.length === 0) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      const nodesRes = await options.db.query<ProjectNodeRow>(
        `SELECT id, name, kind, size_bytes, deleted_at FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL`,
        [projectId],
      );

      const activeFiles = nodesRes.rows.filter((n) => n.kind === "FILE");
      const fileCount = activeFiles.length;
      const sizeBytes = activeFiles.reduce((sum, n) => sum + Number(n.size_bytes ?? 0), 0);

      // Approximate word count: calculate across main or text files
      let approximateWords = 0;
      for (const file of activeFiles) {
        if (file.name.endsWith(".tex") || file.name.endsWith(".txt")) {
          // If content is not stored in DB node row, approximate using size_bytes / 6
          const estimated = Math.max(0, Math.round(Number(file.size_bytes ?? 0) / 6));
          approximateWords += estimated;
        }
      }

      // Check last compilation
      const compRepo = new CompilationsRepository(options.db);
      const recentJobs = await compRepo.listJobs(projectId, { limit: 1 });
      const lastJob = recentJobs.items[0];
      const lastCompilationAt = lastJob?.finishedAt ?? lastJob?.startedAt ?? null;

      const stats: StatisticsView = {
        approximateWords,
        sizeBytes,
        fileCount,
        lastCompilationAt,
      };

      return reply.code(200).send(statisticsSchema.parse(stats));
    },
  );
}
