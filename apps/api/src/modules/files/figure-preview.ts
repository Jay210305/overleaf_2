import type { FastifyInstance } from "fastify";
import { isUUID, type DatabaseClient } from "@latex-collab/db";
import { maxFileBytes, type StorageAdapter } from "@latex-collab/storage";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxPreviewBytes = maxFileBytes;

type Node = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: "FILE" | "FOLDER";
  content_kind: "TEXT" | "BINARY";
  mime: string;
  blob_key: string | null;
};

function pathFor(node: Node, nodes: Map<string, Node>): string[] | null {
  const path: string[] = [];
  const seen = new Set<string>();
  let current: Node | undefined = node;
  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    path.unshift(current.name);
    if (!current.parent_id) return path;
    current = nodes.get(current.parent_id);
  }
  return null;
}

export function registerFigurePreviewRoute(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined; storage?: StorageAdapter | undefined },
): void {
  app.get(
    "/api/v1/projects/:projectId/files/:fileId/figure",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      try {
        if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const { projectId, fileId } = request.params as { projectId: string; fileId: string };
        const path = (request.query as { path?: unknown }).path;
        if (
          !isUUID(fileId) ||
          typeof path !== "string" ||
          path.length === 0 ||
          path.length > 1000 ||
          path
            .split("/")
            .some((part) => !part || part === "." || part === ".." || part.includes("\\"))
        )
          throw new AuthError(400, "VALIDATION_ERROR");
        const result = await options.db.query<Node>(
          `SELECT id, parent_id, name, kind, content_kind, mime, blob_key
           FROM project_nodes WHERE project_id = $1 AND deleted_at IS NULL`,
          [projectId],
        );
        const nodes = new Map(result.rows.map((node) => [node.id, node]));
        const source = nodes.get(fileId);
        if (!source || source.kind !== "FILE" || source.content_kind !== "TEXT")
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        const sourcePath = pathFor(source, nodes);
        if (!sourcePath) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        const targetPath = [...sourcePath.slice(0, -1), ...path.split("/")].join("/");
        const target = result.rows.find((node) => pathFor(node, nodes)?.join("/") === targetPath);
        if (
          !target ||
          target.kind !== "FILE" ||
          target.content_kind !== "BINARY" ||
          !imageTypes.has(target.mime) ||
          !target.blob_key?.startsWith(`projects/${projectId}/blobs/`)
        )
          throw new AuthError(404, "RESOURCE_NOT_FOUND");
        const bytes = await options.storage.getLimited(target.blob_key, maxPreviewBytes);
        return reply.type(target.mime).send(Buffer.from(bytes));
      } catch (error) {
        if (error instanceof AuthError)
          return reply
            .code(error.status)
            .type("application/problem+json")
            .send(problem(error.status, error.code, request.id));
        return reply
          .code(503)
          .type("application/problem+json")
          .send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }
    },
  );
}
