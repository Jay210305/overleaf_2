import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  githubOAuthCallbackSchema,
  githubOAuthStartResponseSchema,
  githubOAuthStatusSchema,
  type GitHubConnectionView,
} from "@latex-collab/contracts";
import type { DatabaseClient } from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { problem } from "../../plugins/errors.js";

export const GITHUB_PROVIDER = "github" as const;
const STATE_TTL_MS = 10 * 60 * 1000;
const ENCRYPTED_PREFIX = "v1.";

export interface GitHubOAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  callbackUrl: string;
  scopes: string[];
  /** Server-held secret (min 16 chars); derived to an AES-256-GCM key. Never leaves the server. */
  encryptionKey: string;
}

export interface TokenExchangeInput {
  code: string;
  verifier: string;
}
export interface ExchangedTokens {
  accessToken: string;
  scope: string;
}
export type ExchangeCode = (input: TokenExchangeInput) => Promise<ExchangedTokens>;
export type RevokeToken = (token: string) => Promise<void>;

export type ProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "CREDENTIALS_MISSING"
  | "TOKEN_EXPIRED"
  | "CAPABILITY_UNSUPPORTED"
  | "REMOTE_CONFLICT"
  | "RATE_LIMITED";
export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ProviderErrorCode; retryable: boolean; detail: string } };

export interface OAuthStateData {
  userId: string;
  verifier: string;
  expiresAtMs: number;
}

/** Single-use OAuth state store. Memory-backed: single API replica only; a shared store is later work. */
export class MemoryOAuthStateStore {
  private readonly states = new Map<string, OAuthStateData>();
  async create(state: string, data: OAuthStateData): Promise<void> {
    this.states.set(hashState(state), data);
  }
  async consume(state: string): Promise<OAuthStateData | null> {
    const key = hashState(state);
    const item = this.states.get(key);
    if (!item) return null;
    this.states.delete(key);
    if (item.expiresAtMs <= Date.now()) return null;
    return item;
  }
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function deriveKey(encryptionKey: string): Buffer {
  return createHash("sha256").update(encryptionKey, "utf8").digest();
}

/** AES-256-GCM pack; only the packed ciphertext is persisted. Exported for tests; server-only. */
export function encryptToken(encryptionKey: string, token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${base64url(iv)}.${base64url(ciphertext)}.${base64url(tag)}`;
}

/** Exported for tests only; the HTTP layer never returns decrypted tokens. */
export function decryptToken(encryptionKey: string, packed: string): string {
  const parts = packed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid credential encoding");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(encryptionKey),
    Buffer.from(parts[1]!, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(parts[3]!, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2]!, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function githubAuthConfigFromEnv(
  env: Record<string, unknown>,
): GitHubOAuthConfig | undefined {
  const clientId = typeof env["GITHUB_CLIENT_ID"] === "string" ? env["GITHUB_CLIENT_ID"] : "";
  const encryptionKey =
    typeof env["GITHUB_TOKEN_ENCRYPTION_KEY"] === "string"
      ? env["GITHUB_TOKEN_ENCRYPTION_KEY"]
      : "";
  if (clientId.length === 0 || encryptionKey.length < 16) return undefined;
  const scopes =
    typeof env["GITHUB_SCOPES"] === "string" && env["GITHUB_SCOPES"].length > 0
      ? env["GITHUB_SCOPES"]
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : ["repo"];
  return {
    clientId,
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    callbackUrl:
      typeof env["APP_ORIGIN"] === "string" ? `${env["APP_ORIGIN"]}/settings/integrations` : "",
    scopes,
    encryptionKey,
  };
}

async function defaultExchangeCode(
  tokenEndpoint: string,
  clientId: string,
  input: TokenExchangeInput,
): Promise<ExchangedTokens> {
  let response: Response;
  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        code: input.code,
        code_verifier: input.verifier,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new AuthError(502, "PROVIDER_UNAVAILABLE");
  }
  if (response.status === 429) throw new AuthError(429, "RATE_LIMITED");
  if (!response.ok) throw new AuthError(502, "PROVIDER_UNAVAILABLE");
  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    scope?: unknown;
    error?: unknown;
  } | null;
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.access_token !== "string" ||
    body.access_token.length === 0
  )
    throw new AuthError(502, "PROVIDER_UNAVAILABLE");
  return {
    accessToken: body.access_token,
    scope: typeof body.scope === "string" ? body.scope : "",
  };
}

export interface GitHubAuthServiceOptions {
  db: DatabaseClient;
  config: GitHubOAuthConfig;
  store?: MemoryOAuthStateStore | undefined;
  exchangeCode?: ExchangeCode | undefined;
  revokeToken?: RevokeToken | undefined;
}

export interface GitHubConnection {
  connectionId: string;
  capabilities: { list: boolean; pull: boolean; push: boolean; individualReferenceImport: boolean };
}

const LINK_CAPABILITIES = {
  list: false,
  pull: false,
  push: false,
  individualReferenceImport: false,
};

export function createGitHubAuthService(options: GitHubAuthServiceOptions) {
  const store = options.store ?? new MemoryOAuthStateStore();
  const exchange: ExchangeCode =
    options.exchangeCode ??
    ((input) => defaultExchangeCode(options.config.tokenEndpoint, options.config.clientId, input));

  async function start(userId: string): Promise<{ authorizationUrl: string; state: string }> {
    const state = base64url(randomBytes(32));
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    await store.create(state, { userId, verifier, expiresAtMs: Date.now() + STATE_TTL_MS });
    const params = new URLSearchParams({
      client_id: options.config.clientId,
      scope: options.config.scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    if (options.config.callbackUrl) params.set("redirect_uri", options.config.callbackUrl);
    return githubOAuthStartResponseSchema.parse({
      authorizationUrl: `${options.config.authorizationEndpoint}?${params.toString()}`,
      state,
    });
  }

  async function connect(
    userId: string,
    input: { code: string; state: string },
  ): Promise<ProviderResult<GitHubConnection>> {
    const parsed = githubOAuthCallbackSchema.parse(input);
    const state = await store.consume(parsed.state);
    if (!state || state.userId !== userId)
      return {
        ok: false,
        error: { code: "CREDENTIALS_MISSING", retryable: false, detail: "Invalid OAuth state" },
      };
    let tokens: ExchangedTokens;
    try {
      tokens = await exchange({ code: parsed.code, verifier: state.verifier });
    } catch (error) {
      if (
        error instanceof AuthError &&
        (error.code === "RATE_LIMITED" || error.code === "PROVIDER_UNAVAILABLE")
      )
        return {
          ok: false,
          error: {
            code: error.code,
            retryable: error.code === "RATE_LIMITED",
            detail: "Provider token exchange failed",
          },
        };
      throw error;
    }
    const packed = encryptToken(options.config.encryptionKey, tokens.accessToken);
    const scopes = tokens.scope
      ? tokens.scope
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : options.config.scopes;
    await options.db.query(
      "DELETE FROM external_connections WHERE user_id = $1 AND provider = $2",
      [userId, GITHUB_PROVIDER],
    );
    const inserted = await options.db.query<{ id: string }>(
      `INSERT INTO external_connections (user_id, provider, encrypted_credential_ref, scopes_json, status)
       VALUES ($1, $2, $3, $4::jsonb, 'active') RETURNING id`,
      [userId, GITHUB_PROVIDER, packed, JSON.stringify(scopes)],
    );
    return {
      ok: true,
      value: { connectionId: inserted.rows[0]!.id, capabilities: { ...LINK_CAPABILITIES } },
    };
  }

  async function status(
    userId: string,
  ): Promise<{ connected: boolean; connection?: GitHubConnectionView }> {
    const rows = await options.db.query<{
      id: string;
      scopes_json: unknown;
      status: string;
      created_at: Date;
    }>(
      `SELECT id, scopes_json, status, created_at FROM external_connections
       WHERE user_id = $1 AND provider = $2 AND status = 'active' LIMIT 1`,
      [userId, GITHUB_PROVIDER],
    );
    const row = rows.rows[0];
    if (!row) return { connected: false };
    const scopes = Array.isArray(row.scopes_json)
      ? row.scopes_json.filter((scope): scope is string => typeof scope === "string")
      : [];
    return {
      connected: true,
      connection: {
        id: row.id,
        provider: GITHUB_PROVIDER,
        scopes,
        status: row.status,
        createdAt: row.created_at.toISOString(),
      },
    };
  }

  async function disconnect(userId: string): Promise<boolean> {
    const rows = await options.db.query<{ id: string; encrypted_credential_ref: string }>(
      `SELECT id, encrypted_credential_ref FROM external_connections
       WHERE user_id = $1 AND provider = $2 LIMIT 1`,
      [userId, GITHUB_PROVIDER],
    );
    const row = rows.rows[0];
    if (!row) return false;
    if (options.revokeToken) {
      try {
        await options.revokeToken(
          decryptToken(options.config.encryptionKey, row.encrypted_credential_ref),
        );
      } catch {
        // Best-effort provider revocation; the local credential is still removed below.
      }
    }
    await options.db.query("DELETE FROM external_connections WHERE id = $1", [row.id]);
    return true;
  }

  return { start, connect, status, disconnect };
}

function handleGitHubAuthError(error: unknown, reply: FastifyReply, requestId: string) {
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

export interface GitHubAuthRouteOptions {
  db?: DatabaseClient | undefined;
  githubAuth?:
    | {
        config?: GitHubOAuthConfig | undefined;
        store?: MemoryOAuthStateStore | undefined;
        exchangeCode?: ExchangeCode | undefined;
        revokeToken?: RevokeToken | undefined;
      }
    | undefined;
}

/**
 * GitHub OAuth credential handling. Tokens are encrypted server-side and never
 * enter browser responses, logs or error details. Without provider
 * configuration every mutating endpoint answers CREDENTIALS_MISSING explicitly.
 */
export function registerGitHubAuthRoutes(
  app: FastifyInstance,
  options: GitHubAuthRouteOptions,
): void {
  // One shared single-use state store per registration; per-request stores
  // would never observe states issued by earlier requests.
  const store = options.githubAuth?.store ?? new MemoryOAuthStateStore();
  const sessionIdentity = (request: {
    sessionIdentity?: unknown;
  }): { userId: string } | undefined => {
    const identity = request.sessionIdentity as { userId: string } | undefined;
    return typeof identity?.userId === "string" ? { userId: identity.userId } : undefined;
  };

  app.post(
    "/api/v1/integrations/github/start",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = sessionIdentity(request);
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        if (!options.githubAuth?.config) throw new AuthError(503, "CREDENTIALS_MISSING");
        const service = createGitHubAuthService({
          db: options.db,
          config: options.githubAuth.config,
          store,
        });
        return reply
          .code(200)
          .type("application/json")
          .send(await service.start(identity.userId));
      } catch (error) {
        return handleGitHubAuthError(error, reply, request.id);
      }
    },
  );

  app.post(
    "/api/v1/integrations/github/callback",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = sessionIdentity(request);
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        if (!options.githubAuth?.config) throw new AuthError(503, "CREDENTIALS_MISSING");
        const parsed = githubOAuthCallbackSchema.safeParse(request.body);
        if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
        const service = createGitHubAuthService({
          db: options.db,
          config: options.githubAuth.config,
          store,
          exchangeCode: options.githubAuth.exchangeCode,
          revokeToken: options.githubAuth.revokeToken,
        });
        const result = await service.connect(identity.userId, parsed.data);
        if (!result.ok) {
          if (result.error.code === "CREDENTIALS_MISSING")
            throw new AuthError(403, "OAUTH_STATE_INVALID");
          if (result.error.code === "RATE_LIMITED") throw new AuthError(429, "RATE_LIMITED");
          throw new AuthError(502, "PROVIDER_UNAVAILABLE");
        }
        return reply.code(200).type("application/json").send({
          connectionId: result.value.connectionId,
          provider: GITHUB_PROVIDER,
          scopes: options.githubAuth.config.scopes,
        });
      } catch (error) {
        return handleGitHubAuthError(error, reply, request.id);
      }
    },
  );

  app.get(
    "/api/v1/integrations/github/status",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = sessionIdentity(request);
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        if (!options.githubAuth?.config)
          return reply
            .code(200)
            .type("application/json")
            .send(githubOAuthStatusSchema.parse({ connected: false }));
        const service = createGitHubAuthService({
          db: options.db,
          config: options.githubAuth.config,
          store,
        });
        const current = await service.status(identity.userId);
        if (!current.connected || !current.connection)
          return reply
            .code(200)
            .type("application/json")
            .send(githubOAuthStatusSchema.parse({ connected: false }));
        return reply
          .code(200)
          .type("application/json")
          .send(
            githubOAuthStatusSchema.parse({
              connected: true,
              connectionId: current.connection.id,
              scopes: current.connection.scopes,
            }),
          );
      } catch (error) {
        return handleGitHubAuthError(error, reply, request.id);
      }
    },
  );

  app.post(
    "/api/v1/integrations/github/disconnect",
    { config: { sessionOnly: true } },
    async (request, reply) => {
      try {
        if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
        const identity = sessionIdentity(request);
        if (!identity) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
        if (!options.githubAuth?.config) throw new AuthError(503, "CREDENTIALS_MISSING");
        const service = createGitHubAuthService({
          db: options.db,
          config: options.githubAuth.config,
          store: options.githubAuth.store,
          revokeToken: options.githubAuth.revokeToken,
        });
        const removed = await service.disconnect(identity.userId);
        if (!removed) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        return reply.code(200).type("application/json").send({ disconnected: true });
      } catch (error) {
        return handleGitHubAuthError(error, reply, request.id);
      }
    },
  );
}
