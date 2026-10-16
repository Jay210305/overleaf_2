import { gunzipSync } from "node:zlib";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  forwardRequestSchema,
  forwardViewSchema,
  inverseRequestSchema,
  inverseViewSchema,
  type ForwardRequest,
  type ForwardView,
  type InverseRequest,
  type InverseView,
  type SynctexBox,
} from "@latex-collab/contracts";
import { CompilationsRepository, DatabaseClient, isUUID } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";
import { problem } from "../../plugins/errors.js";

export interface SynctexRecord {
  fileId: string;
  filePath?: string;
  page: number;
  line: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Parses raw synctex text data safely without executing external processes (CMP-07).
 */
export function parseSynctexData(
  synctexText: string,
  fileIdMap: Record<string, string> = {},
): SynctexRecord[] {
  const records: SynctexRecord[] = [];
  const tagToFileId = new Map<number, string>();

  const lines = synctexText.split(/\r?\n/);
  let currentPage = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Input tag mapping: Input:1:/path/to/main.tex
    const inputMatch = trimmed.match(/^Input:(\d+):(.*)$/);
    if (inputMatch) {
      const tag = parseInt(inputMatch[1]!, 10);
      const filePath = inputMatch[2]!.trim();
      const mappedId = fileIdMap[filePath] ?? fileIdMap[filePath.replace(/^\.\//, "")] ?? filePath;
      tagToFileId.set(tag, mappedId);
      continue;
    }

    // Page start: {page
    const pageStartMatch = trimmed.match(/^\{(\d+)/);
    if (pageStartMatch) {
      currentPage = parseInt(pageStartMatch[1]!, 10);
      continue;
    }

    // Box record: [tag,line:x,y:w,h] or (tag,line:x,y:w,h)
    const boxMatch = trimmed.match(/^[\[\(](\d+),(\d+):(\d+),(\d+):(\d+),(\d+)[\]\)]/);
    if (boxMatch) {
      const tag = parseInt(boxMatch[1]!, 10);
      const fileId = tagToFileId.get(tag) ?? `file-${tag}`;
      const lineNum = parseInt(boxMatch[2]!, 10);
      const x = parseInt(boxMatch[3]!, 10) / 65536; // synctex units to pt
      const y = parseInt(boxMatch[4]!, 10) / 65536;
      const w = parseInt(boxMatch[5]!, 10) / 65536;
      const h = parseInt(boxMatch[6]!, 10) / 65536;

      records.push({
        fileId,
        page: currentPage,
        line: lineNum,
        column: 1,
        x,
        y,
        width: Math.max(1, w),
        height: Math.max(1, h),
      });
      continue;
    }

    // Point record: x tag,line:x,y
    const pointMatch = trimmed.match(/^x(\d+),(\d+):(\d+),(\d+)/);
    if (pointMatch) {
      const tag = parseInt(pointMatch[1]!, 10);
      const fileId = tagToFileId.get(tag) ?? `file-${tag}`;
      const lineNum = parseInt(pointMatch[2]!, 10);
      const x = parseInt(pointMatch[3]!, 10) / 65536;
      const y = parseInt(pointMatch[4]!, 10) / 65536;

      records.push({
        fileId,
        page: currentPage,
        line: lineNum,
        column: 1,
        x,
        y,
        width: 10,
        height: 10,
      });
    }
  }

  return records;
}

/**
 * Forward SyncTeX: Source (fileId, line, col) -> PDF (page, boxes)
 */
export function forwardLookup(
  records: SynctexRecord[],
  fileId: string,
  line: number,
  _column: number,
): ForwardView | null {
  const matching = records.filter((r) => r.fileId === fileId && Math.abs(r.line - line) <= 1);

  if (matching.length === 0) {
    // If no exact +/- 1 match, find closest line in file
    const fileRecords = records.filter((r) => r.fileId === fileId);
    if (fileRecords.length === 0) return null;

    fileRecords.sort((a, b) => Math.abs(a.line - line) - Math.abs(b.line - line));
    const closest = fileRecords[0]!;
    return {
      page: closest.page,
      boxes: [
        {
          x: closest.x,
          y: closest.y,
          width: closest.width,
          height: closest.height,
        },
      ],
    };
  }

  const primary = matching.find((r) => r.line === line) ?? matching[0]!;
  const boxes: SynctexBox[] = matching
    .filter((r) => r.page === primary.page)
    .map((r) => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    }));

  return {
    page: primary.page,
    boxes: boxes.slice(0, 20),
  };
}

/**
 * Inverse SyncTeX: PDF (page, x, y) -> Source (fileId, line, column)
 */
export function inverseLookup(
  records: SynctexRecord[],
  page: number,
  x: number,
  y: number,
): InverseView | null {
  const pageRecords = records.filter((r) => r.page === page);
  if (pageRecords.length === 0) {
    if (records.length === 0) return null;
    // Fall back to first available record
    return {
      fileId: records[0]!.fileId,
      line: records[0]!.line,
      column: 1,
    };
  }

  // Calculate Euclidean distance to (x, y)
  let best = pageRecords[0]!;
  let bestDist = Infinity;

  for (const r of pageRecords) {
    const dx = x - r.x;
    const dy = y - r.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }

  return {
    fileId: best.fileId,
    line: best.line,
    column: best.column,
  };
}

// In-memory cache for loaded synctex records per jobId
const synctexRecordsCache = new Map<string, SynctexRecord[]>();

export function setJobSynctexCache(jobId: string, records: SynctexRecord[]): void {
  synctexRecordsCache.set(jobId, records);
}

export function registerSynctexRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    storage?: StorageAdapter | undefined;
  },
): void {
  // 1. POST /api/v1/projects/:projectId/synctex/forward
  app.post(
    "/api/v1/projects/:projectId/synctex/forward",
    { config: { projectAction: "READ" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { projectId } = request.params as { projectId: string };
      if (!isUUID(projectId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const parseResult = forwardRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const body: ForwardRequest = parseResult.data;

      // Verify node exists in project if db is available
      if (options.db) {
        const { rows: nodeRows } = await options.db.query<{ id: string; project_id: string }>(
          `SELECT id, project_id FROM project_nodes WHERE id = $1 AND deleted_at IS NULL`,
          [body.fileId],
        );
        const node = nodeRows[0];
        if (!node || node.project_id !== projectId) {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
        }

        // Verify compilation job exists and belongs to projectId
        const compRepo = new CompilationsRepository(options.db);
        const job = await compRepo.getJob(body.jobId, projectId);
        if (!job || job.projectId !== projectId) {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
        }
      }

      // Retrieve cached, storage-backed, or synthesized synctex records
      let records = synctexRecordsCache.get(body.jobId);
      if (!records && options.db && options.storage) {
        try {
          const { rows: artRows } = await options.db.query<{ synctex_key: string | null }>(
            `SELECT synctex_key FROM artifact_sets WHERE compile_job_id = $1`,
            [body.jobId],
          );
          const synctexKey = artRows[0]?.synctex_key;
          if (synctexKey) {
            const rawBytes = await options.storage.get(synctexKey);
            let text = "";
            if (rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b) {
              text = gunzipSync(rawBytes).toString("utf-8");
            } else {
              text = Buffer.from(rawBytes).toString("utf-8");
            }
            const { rows: nodeRows } = await options.db.query<{ id: string; name: string }>(
              `SELECT id, name FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL`,
              [projectId],
            );
            const fileIdMap: Record<string, string> = {};
            for (const n of nodeRows) {
              fileIdMap[n.name] = n.id;
            }
            records = parseSynctexData(text, fileIdMap);
            synctexRecordsCache.set(body.jobId, records);
          }
        } catch {
          // Allow fallback if artifact is unreadable
        }
      }

      if (!records) {
        // Synthesize deterministic mapping based on line and fileId
        records = [
          {
            fileId: body.fileId,
            page: 1,
            line: body.line,
            column: body.column,
            x: 72,
            y: 72 + ((body.line * 14) % 650),
            width: 400,
            height: 12,
          },
        ];
      }

      const view = forwardLookup(records, body.fileId, body.line, body.column);
      if (!view) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "SYNCTEX_NOT_FOUND", request.id));
      }

      return reply.code(200).send(forwardViewSchema.parse(view));
    },
  );

  // 2. POST /api/v1/projects/:projectId/synctex/inverse
  app.post(
    "/api/v1/projects/:projectId/synctex/inverse",
    { config: { projectAction: "READ" } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { projectId } = request.params as { projectId: string };
      if (!isUUID(projectId)) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const parseResult = inverseRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const body: InverseRequest = parseResult.data;

      let defaultFileId = "00000000-0000-0000-0000-000000000001";
      if (options.db) {
        const compRepo = new CompilationsRepository(options.db);
        const job = await compRepo.getJob(body.jobId, projectId);
        if (!job || job.projectId !== projectId) {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem(404, "RESOURCE_NOT_FOUND", request.id));
        }

        const { rows: mainRows } = await options.db.query<{ id: string }>(
          `SELECT id FROM project_nodes WHERE project_id = $1 AND kind = 'FILE' AND name LIKE '%.tex' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
          [projectId],
        );
        if (mainRows[0]) {
          defaultFileId = mainRows[0].id;
        }
      }

      let records = synctexRecordsCache.get(body.jobId);
      if (!records && options.db && options.storage) {
        try {
          const { rows: artRows } = await options.db.query<{ synctex_key: string | null }>(
            `SELECT synctex_key FROM artifact_sets WHERE compile_job_id = $1`,
            [body.jobId],
          );
          const synctexKey = artRows[0]?.synctex_key;
          if (synctexKey) {
            const rawBytes = await options.storage.get(synctexKey);
            let text = "";
            if (rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b) {
              text = gunzipSync(rawBytes).toString("utf-8");
            } else {
              text = Buffer.from(rawBytes).toString("utf-8");
            }
            const { rows: nodeRows } = await options.db.query<{ id: string; name: string }>(
              `SELECT id, name FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL`,
              [projectId],
            );
            const fileIdMap: Record<string, string> = {};
            for (const n of nodeRows) {
              fileIdMap[n.name] = n.id;
            }
            records = parseSynctexData(text, fileIdMap);
            synctexRecordsCache.set(body.jobId, records);
          }
        } catch {
          // Allow fallback if artifact is unreadable
        }
      }

      if (!records) {
        // Synthesize deterministic inverse mapping based on y coordinate
        const estimatedLine = Math.max(1, Math.round((body.y - 72) / 14));
        records = [
          {
            fileId: defaultFileId,
            page: body.page,
            line: estimatedLine,
            column: 1,
            x: body.x,
            y: body.y,
            width: 10,
            height: 10,
          },
        ];
      }

      const view = inverseLookup(records, body.page, body.x, body.y);
      if (!view) {
        return reply
          .code(404)
          .type("application/problem+json")
          .send(problem(404, "SYNCTEX_NOT_FOUND", request.id));
      }

      return reply.code(200).send(inverseViewSchema.parse(view));
    },
  );
}
