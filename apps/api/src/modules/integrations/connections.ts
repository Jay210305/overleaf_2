import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  type ConnectProviderRequest,
  type ExternalConnectionView,
  type LinkProjectIntegrationRequest,
  type ProjectIntegrationView,
  type ProviderCapabilities,
  connectProviderRequestSchema,
  linkProjectIntegrationRequestSchema,
} from "@latex-collab/contracts";
import { isUUID, type DatabaseClient } from "@latex-collab/db";
import { requireSession } from "../../plugins/require-session.js";
import { problem } from "../../plugins/errors.js";

const DEFAULT_SECRET = "latex-collab-integration-secret-key-32b";

function getEncryptionKey(customKey?: string): Buffer {
  const secret = customKey || process.env.INTEGRATION_CREDENTIAL_KEY || process.env.SESSION_SECRET || DEFAULT_SECRET;
  return createHash("sha256").update(secret).digest();
}

export function encryptCredential(plaintext: string, customKey?: string): string {
  const key = getEncryptionKey(customKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptCredential(ciphertext: string, customKey?: string): string {
  if (!ciphertext.startsWith("enc:v1:")) {
    throw new Error("Invalid encrypted credential format");
  }
  const parts = ciphertext.split(":");
  if (parts.length !== 5) {
    throw new Error("Malformed encrypted credential parts");
  }
  const iv = Buffer.from(parts[2]!, "hex");
  const tag = Buffer.from(parts[3]!, "hex");
  const encryptedData = Buffer.from(parts[4]!, "hex");

  const key = getEncryptionKey(customKey);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return decrypted.toString("utf8");
}

export function getProviderCapabilities(provider: string): ProviderCapabilities {
  switch (provider.toLowerCase()) {
    case "zotero":
      return {
        list: true,
        pull: true,
        push: false,
        individualReferenceImport: true,
      };
    case "dropbox":
      return {
        list: true,
        pull: true,
        push: true,
        individualReferenceImport: false,
      };
    case "mendeley":
    case "papers":
      return {
        list: false,
        pull: false,
        push: false,
        individualReferenceImport: false,
      };
    default:
      return {
        list: false,
        pull: false,
        push: false,
        individualReferenceImport: false,
      };
  }
}

export interface ExternalConnectionRow {
  id: string;
  user_id: string;
  provider: string;
  encrypted_credential_ref: string;
  scopes_json: string[] | string;
  status: string;
  created_at: Date;
}

export interface ProjectIntegrationRow {
  id: string;
  project_id: string;
  connection_id: string;
  provider: string;
  remote_ref: string;
  branch: string | null;
  last_synced_revision: string | null;
  sync_cursor: string | null;
}

export function toConnectionView(row: ExternalConnectionRow): ExternalConnectionView {
  const scopes = Array.isArray(row.scopes_json)
    ? row.scopes_json
    : typeof row.scopes_json === "string"
      ? JSON.parse(row.scopes_json)
      : [];
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    scopes,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export function toProjectIntegrationView(row: ProjectIntegrationRow): ProjectIntegrationView {
  return {
    id: row.id,
    projectId: row.project_id,
    connectionId: row.connection_id,
    provider: row.provider,
    remoteRef: row.remote_ref,
    branch: row.branch,
    lastSyncedRevision: row.last_synced_revision,
    syncCursor: row.sync_cursor,
  };
}

export function registerIntegrationRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    origin?: string | undefined;
    secureCookies?: boolean | undefined;
  },
): void {
  const origin = options.origin;
  const secureCookies = options.secureCookies ?? false;

  // List current user's connections
  app.get("/api/v1/integrations/connections", async (request, reply) => {
    if (!options.db) return reply.code(503).send(problem(503, "SERVICE_UNAVAILABLE", request.id));
    const identity = await requireSession(options.db, request, origin, secureCookies, false);

    const result = await options.db.query<ExternalConnectionRow>(
      `SELECT id, user_id, provider, encrypted_credential_ref, scopes_json, status, created_at
       FROM external_connections
       WHERE user_id = $1 AND status != 'revoked'
       ORDER BY created_at DESC`,
      [identity.userId],
    );

    return {
      items: result.rows.map(toConnectionView),
    };
  });

  // Connect or register external credentials
  app.post("/api/v1/integrations/connections/:provider/connect", async (request, reply) => {
    if (!options.db) return reply.code(503).send(problem(503, "SERVICE_UNAVAILABLE", request.id));
    const identity = await requireSession(options.db, request, origin, secureCookies, true);

    const { provider } = request.params as { provider: string };
    const normalizedProvider = provider.toLowerCase();

    // Check if provider has legitimate API access
    if (normalizedProvider === "mendeley" || normalizedProvider === "papers") {
      return reply
        .code(422)
        .type("application/problem+json")
        .send(problem(422, "CAPABILITY_UNSUPPORTED", request.id, "Provider integration is BLOCKED_BY_PROVIDER: no legitimate public API or terms access permitted."));
    }

    const parseResult = connectProviderRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem(400, "VALIDATION_ERROR", request.id, "Invalid connect provider payload"));
    }

    const payload: ConnectProviderRequest = parseResult.data;
    const token = payload.apiKey || payload.code;
    if (!token) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(problem(400, "CREDENTIALS_MISSING", request.id, "apiKey or OAuth code is required"));
    }

    const encryptedToken = encryptCredential(token);
    const scopes = payload.scopes ?? ["read", "write"];
    const connectionId = randomUUID();

    const insertResult = await options.db.query<ExternalConnectionRow>(
      `INSERT INTO external_connections (id, user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, user_id, provider, encrypted_credential_ref, scopes_json, status, created_at`,
      [connectionId, identity.userId, normalizedProvider, encryptedToken, JSON.stringify(scopes)],
    );

    const row = insertResult.rows[0]!;
    const capabilities = getProviderCapabilities(normalizedProvider);

    return reply.code(201).send({
      connection: toConnectionView(row),
      capabilities,
    });
  });

  // Refresh connection token (rotation support)
  app.post("/api/v1/integrations/connections/:connectionId/refresh", async (request, reply) => {
    if (!options.db) return reply.code(503).send(problem(503, "SERVICE_UNAVAILABLE", request.id));
    const identity = await requireSession(options.db, request, origin, secureCookies, true);

    const { connectionId } = request.params as { connectionId: string };
    if (!isUUID(connectionId)) {
      return reply.code(400).type("application/problem+json").send(problem(400, "VALIDATION_ERROR", request.id));
    }

    const found = await options.db.query<ExternalConnectionRow>(
      `SELECT id, user_id, provider, encrypted_credential_ref, scopes_json, status, created_at
       FROM external_connections
       WHERE id = $1 AND user_id = $2`,
      [connectionId, identity.userId],
    );

    const row = found.rows[0];
    if (!row) {
      return reply.code(404).type("application/problem+json").send(problem(404, "RESOURCE_NOT_FOUND", request.id));
    }

    if (row.status === "revoked" || row.status === "expired") {
      return reply
        .code(401)
        .type("application/problem+json")
        .send(problem(401, "TOKEN_EXPIRED", request.id, "Connection credential has expired or been revoked"));
    }

    // Rotate token by re-encrypting with fresh IV
    const decrypted = decryptCredential(row.encrypted_credential_ref);
    const refreshedCipher = encryptCredential(decrypted);

    const updateResult = await options.db.query<ExternalConnectionRow>(
      `UPDATE external_connections
       SET encrypted_credential_ref = $1, status = 'active'
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id, provider, encrypted_credential_ref, scopes_json, status, created_at`,
      [refreshedCipher, connectionId, identity.userId],
    );

    const updatedRow = updateResult.rows[0]!;
    return reply.code(200).send({
      connection: toConnectionView(updatedRow),
      refreshedAt: new Date().toISOString(),
    });
  });

  // Disconnect / Revoke connection
  app.delete("/api/v1/integrations/connections/:connectionId", async (request, reply) => {
    if (!options.db) return reply.code(503).send(problem(503, "SERVICE_UNAVAILABLE", request.id));
    const identity = await requireSession(options.db, request, origin, secureCookies, true);

    const { connectionId } = request.params as { connectionId: string };
    if (!isUUID(connectionId)) {
      return reply.code(400).type("application/problem+json").send(problem(400, "VALIDATION_ERROR", request.id));
    }

    const result = await options.db.query(
      `UPDATE external_connections
       SET status = 'revoked'
       WHERE id = $1 AND user_id = $2`,
      [connectionId, identity.userId],
    );

    if (result.rowCount === 0) {
      return reply.code(404).type("application/problem+json").send(problem(404, "RESOURCE_NOT_FOUND", request.id));
    }

    // Also remove associated project integrations
    await options.db.query(
      `DELETE FROM project_integrations WHERE connection_id = $1`,
      [connectionId],
    );

    return reply.code(204).send();
  });

  // Project integrations: List project integrations (requires project READ)
  app.get(
    "/api/v1/projects/:projectId/integrations",
    { config: { projectAction: "READ" } },
    async (request, reply) => {
      if (!options.db) return reply.code(503).send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      const auth = request.projectAuthorization!;

      const result = await options.db.query<ProjectIntegrationRow>(
        `SELECT id, project_id, connection_id, provider, remote_ref, branch, last_synced_revision, sync_cursor
         FROM project_integrations
         WHERE project_id = $1`,
        [auth.projectId],
      );

      return {
        items: result.rows.map(toProjectIntegrationView),
      };
    },
  );

  // Project integrations: Link connection to project (requires project EDIT, connection must belong to user)
  app.post(
    "/api/v1/projects/:projectId/integrations",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      if (!options.db) return reply.code(503).send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      const auth = request.projectAuthorization!;

      const parseResult = linkProjectIntegrationRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).type("application/problem+json").send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const body: LinkProjectIntegrationRequest = parseResult.data;

      // Crucial security invariant: connection must belong to the user attempting to link it
      const connectionFound = await options.db.query<ExternalConnectionRow>(
        `SELECT id, user_id, provider, status
         FROM external_connections
         WHERE id = $1`,
        [body.connectionId],
      );

      const connection = connectionFound.rows[0];
      if (!connection) {
        return reply.code(404).type("application/problem+json").send(problem(404, "RESOURCE_NOT_FOUND", request.id, "Connection not found"));
      }

      if (connection.user_id !== auth.userId) {
        // User cannot use another user's connection
        return reply.code(403).type("application/problem+json").send(problem(403, "PROJECT_PERMISSION_DENIED", request.id, "Connection belongs to a different user"));
      }

      if (connection.status !== "active") {
        return reply.code(401).type("application/problem+json").send(problem(401, "TOKEN_EXPIRED", request.id, "Connection is not active"));
      }

      const integrationId = randomUUID();
      const insertResult = await options.db.query<ProjectIntegrationRow>(
        `INSERT INTO project_integrations (id, project_id, connection_id, provider, remote_ref, branch)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (project_id, provider, remote_ref)
         DO UPDATE SET connection_id = EXCLUDED.connection_id, branch = EXCLUDED.branch
         RETURNING id, project_id, connection_id, provider, remote_ref, branch, last_synced_revision, sync_cursor`,
        [integrationId, auth.projectId, body.connectionId, connection.provider, body.remoteRef, body.branch ?? null],
      );

      const row = insertResult.rows[0]!;
      return reply.code(201).send(toProjectIntegrationView(row));
    },
  );

  // Project integrations: Unlink integration (requires project EDIT)
  app.delete(
    "/api/v1/projects/:projectId/integrations/:integrationId",
    { config: { projectAction: "EDIT" } },
    async (request, reply) => {
      if (!options.db) return reply.code(503).send(problem(503, "SERVICE_UNAVAILABLE", request.id));
      const auth = request.projectAuthorization!;
      const { integrationId } = request.params as { integrationId: string };

      if (!isUUID(integrationId)) {
        return reply.code(400).type("application/problem+json").send(problem(400, "VALIDATION_ERROR", request.id));
      }

      const result = await options.db.query(
        `DELETE FROM project_integrations WHERE id = $1 AND project_id = $2`,
        [integrationId, auth.projectId],
      );

      if (result.rowCount === 0) {
        return reply.code(404).type("application/problem+json").send(problem(404, "RESOURCE_NOT_FOUND", request.id));
      }

      return reply.code(204).send();
    },
  );
}
