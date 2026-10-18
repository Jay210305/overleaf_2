import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import * as Y from "yjs";
import {
  type ImportReferencesRequest,
  type ImportReferencesResponse,
  importReferencesRequestSchema,
} from "@latex-collab/contracts";
import { type DatabaseClient, isUUID } from "@latex-collab/db";
import { normalizeBibTeX, parseBibTeX } from "@latex-collab/latex";
import { getProviderCapabilities } from "../integrations/connections.js";
import { problem } from "../../plugins/errors.js";

export function detectDuplicateKeys(existingSource: string, newKeys: string[]): string[] {
  if (!existingSource || existingSource.trim() === "") {
    return [];
  }
  const parsed = parseBibTeX(existingSource);
  const existingKeySet = new Set(parsed.entries.map((e) => e.key.toLowerCase()));
  const duplicates: string[] = [];
  for (const key of newKeys) {
    if (existingKeySet.has(key.toLowerCase())) {
      duplicates.push(key);
    }
  }
  return duplicates;
}

export function registerReferenceImportRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
  },
): void {
  // Import individual editable references into a project .bib file
  app.post(
    "/api/v1/projects/:projectId/references/import",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      if (!options.db) {
        return reply.code(503).send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      }
      const auth = request.projectAuthorization!;

      // 1. Validate payload schema
      const parseResult = importReferencesRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .code(400)
          .type("application/problem+json")
          .send(
            problem(
              400,
              "VALIDATION_ERROR",
              request.id,
              "Invalid reference import request payload",
            ),
          );
      }

      const body: ImportReferencesRequest = parseResult.data;
      const normalizedProvider = body.provider.toLowerCase();

      // 2. Validate provider permissions and capabilities
      if (normalizedProvider === "mendeley" || normalizedProvider === "papers") {
        return reply
          .code(422)
          .type("application/problem+json")
          .send(
            problem(
              422,
              "CAPABILITY_UNSUPPORTED",
              request.id,
              "Provider integration is BLOCKED_BY_PROVIDER: no legitimate public API or terms access permitted.",
            ),
          );
      }

      const caps = getProviderCapabilities(normalizedProvider);
      if (!caps.individualReferenceImport) {
        return reply
          .code(422)
          .type("application/problem+json")
          .send(
            problem(
              422,
              "CAPABILITY_UNSUPPORTED",
              request.id,
              `Provider '${body.provider}' does not support individual reference import`,
            ),
          );
      }

      // 3. Verify connection credential if connectionId is provided
      if (body.connectionId) {
        if (!isUUID(body.connectionId)) {
          return reply
            .code(400)
            .type("application/problem+json")
            .send(problem(400, "VALIDATION_ERROR", request.id));
        }

        const connRes = await options.db.query<{
          id: string;
          user_id: string;
          status: string;
        }>(`SELECT id, user_id, status FROM external_connections WHERE id = $1`, [
          body.connectionId,
        ]);
        const conn = connRes.rows[0];
        if (!conn) {
          return reply
            .code(404)
            .type("application/problem+json")
            .send(problem(404, "RESOURCE_NOT_FOUND", request.id, "Connection not found"));
        }
        if (conn.user_id !== auth.userId) {
          return reply
            .code(403)
            .type("application/problem+json")
            .send(
              problem(
                403,
                "PROJECT_PERMISSION_DENIED",
                request.id,
                "Connection belongs to a different user",
              ),
            );
        }
        if (conn.status !== "active") {
          return reply
            .code(401)
            .type("application/problem+json")
            .send(
              problem(
                401,
                "TOKEN_EXPIRED",
                request.id,
                "Connection credential has expired or been revoked",
              ),
            );
        }
      }

      // 4. Resolve target .bib file
      return await options.db.transaction(async (tx) => {
        let targetFileId = body.targetFileId;

        if (targetFileId) {
          const fileRes = await tx.query<{ id: string; name: string }>(
            `SELECT id, name FROM project_nodes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [targetFileId, auth.projectId],
          );
          if (!fileRes.rows[0]) {
            return reply
              .code(404)
              .type("application/problem+json")
              .send(problem(404, "RESOURCE_NOT_FOUND", request.id, "Target .bib file not found"));
          }
        } else {
          // Look for existing .bib file in project
          const bibRes = await tx.query<{ id: string; name: string }>(
            `SELECT id, name FROM project_nodes
             WHERE project_id = $1 AND deleted_at IS NULL AND (name ILIKE '%.bib' OR name = 'references.bib')
             ORDER BY CASE WHEN name = 'references.bib' THEN 0 ELSE 1 END, name ASC
             LIMIT 1`,
            [auth.projectId],
          );

          if (bibRes.rows[0]) {
            targetFileId = bibRes.rows[0].id;
          } else {
            // Create default references.bib
            targetFileId = randomUUID();
            await tx.query(
              `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind, size_bytes)
               VALUES ($1, $2, NULL, 'references.bib', 'FILE', 'application/x-bibtex', 'TEXT', 0)`,
              [targetFileId, auth.projectId],
            );
          }
        }

        // Ensure text_documents entry exists and lock it
        await tx.query(
          `INSERT INTO text_documents (file_id, project_id, last_persisted_seq)
           VALUES ($1, $2, 0)
           ON CONFLICT (file_id) DO NOTHING`,
          [targetFileId, auth.projectId],
        );

        const lockRes = await tx.query<{
          latest_snapshot_id: string | null;
          last_persisted_seq: number;
        }>(
          `SELECT latest_snapshot_id, last_persisted_seq FROM text_documents WHERE file_id = $1 FOR UPDATE`,
          [targetFileId],
        );
        const docRow = lockRes.rows[0];
        const currentSeq = Number(docRow?.last_persisted_seq ?? 0);

        // Reconstruct doc from snapshots and updates
        const doc = new Y.Doc();
        let uptoSeq = 0;
        if (docRow?.latest_snapshot_id) {
          const snapRes = await tx.query<{
            upto_seq: number;
            state_bytes: Buffer | null;
          }>(`SELECT upto_seq, state_bytes FROM crdt_snapshots WHERE id = $1`, [
            docRow.latest_snapshot_id,
          ]);
          const snap = snapRes.rows[0];
          if (snap?.state_bytes) {
            Y.applyUpdate(doc, new Uint8Array(snap.state_bytes));
            uptoSeq = Number(snap.upto_seq);
          }
        }

        const updatesRes = await tx.query<{
          seq: number;
          payload_bytes: Buffer;
        }>(
          `SELECT seq, payload_bytes FROM crdt_updates WHERE file_id = $1 AND seq > $2 ORDER BY seq ASC`,
          [targetFileId, uptoSeq],
        );
        for (const row of updatesRes.rows) {
          Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
        }

        const existingContent = doc.getText("content").toString();
        const baseVector = Y.encodeStateVector(doc);

        // Detect duplicate keys (INT-01)
        const newKeys = body.entries.map((e) => e.key);
        const duplicates = detectDuplicateKeys(existingContent, newKeys);

        // Prepare new content (INT-08: preserve source by default without silent normalization)
        let newContent: string;
        if (body.normalize) {
          const rawEntries = body.entries.map((e) => e.rawSource.trim()).join("\n\n");
          const combined =
            existingContent.length > 0 ? `${existingContent}\n\n${rawEntries}` : rawEntries;
          newContent = normalizeBibTeX(combined);
        } else {
          const rawEntries = body.entries.map((e) => e.rawSource.trim()).join("\n\n");
          if (existingContent.length === 0) {
            newContent = `${rawEntries}\n`;
          } else if (existingContent.endsWith("\n\n")) {
            newContent = `${existingContent}${rawEntries}\n`;
          } else if (existingContent.endsWith("\n")) {
            newContent = `${existingContent}\n${rawEntries}\n`;
          } else {
            newContent = `${existingContent}\n\n${rawEntries}\n`;
          }
        }

        // Apply canonical Yjs update
        const ytext = doc.getText("content");
        ytext.delete(0, ytext.length);
        ytext.insert(0, newContent);

        const diffUpdate = Y.encodeStateAsUpdate(doc, baseVector);
        const nextSeq = currentSeq + 1;

        // Persist CRDT update row
        await tx.query(
          `INSERT INTO crdt_updates (id, file_id, seq, actor_user_id, payload_bytes, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [randomUUID(), targetFileId, nextSeq, auth.userId, Buffer.from(diffUpdate)],
        );

        // Update text_documents and project_nodes size
        await tx.query(
          `UPDATE text_documents SET last_persisted_seq = $1, updated_at = NOW() WHERE file_id = $2`,
          [nextSeq, targetFileId],
        );
        await tx.query(`UPDATE project_nodes SET size_bytes = $1 WHERE id = $2`, [
          Buffer.byteLength(newContent, "utf8"),
          targetFileId,
        ]);
        await tx.query(`UPDATE projects SET updated_at = NOW() WHERE id = $1`, [auth.projectId]);

        const response: ImportReferencesResponse = {
          success: true,
          importedCount: body.entries.length,
          keys: newKeys,
          targetFileId,
          duplicates,
          newContent,
        };

        return reply.code(200).send(response);
      });
    },
  );
}
