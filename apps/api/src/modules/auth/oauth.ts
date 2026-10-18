import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { oAuthCallbackSchema, oAuthRedirectSchema, userViewSchema } from "@latex-collab/contracts";
import type { DatabaseClient } from "@latex-collab/db";
import { problem } from "../../plugins/errors.js";
import { requireSession } from "../../plugins/require-session.js";
import { AuthError } from "./errors.js";
import { normalizeEmail } from "./register.js";
import { createSessionForUserId, sessionCookie } from "./session.js";

export const SUPPORTED_OAUTH_PROVIDERS = new Set(["google", "github", "zotero", "dropbox"]);
export const BLOCKED_OAUTH_PROVIDERS = new Set(["mendeley", "papers"]);

export interface OAuthUserProfile {
  providerSubject: string;
  email: string;
  displayName?: string;
}

export type OAuthProfileResolver = (
  provider: string,
  code: string,
  codeVerifier: string,
) => Promise<OAuthUserProfile>;

interface PendingOAuth {
  provider: string;
  codeVerifier: string;
  userId?: string | undefined;
  expiresAt: number;
}

// In-memory pending state map with 10-minute TTL
const pendingOAuthStates = new Map<string, PendingOAuth>();

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [state, entry] of pendingOAuthStates.entries()) {
    if (entry.expiresAt <= now) {
      pendingOAuthStates.delete(state);
    }
  }
}

export function clearOAuthStates(): void {
  pendingOAuthStates.clear();
}

export function setPendingOAuthState(state: string, entry: PendingOAuth): void {
  pendingOAuthStates.set(state, entry);
}

export interface OAuthRoutesOptions {
  db?: DatabaseClient | undefined;
  origin?: string | readonly string[] | undefined;
  secureCookies?: boolean | undefined;
  profileResolver?: OAuthProfileResolver | undefined;
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

export function registerOAuthRoutes(app: FastifyInstance, options: OAuthRoutesOptions): void {
  const primaryOrigin = (
    typeof options.origin === "string"
      ? options.origin.split(",")[0]?.trim()
      : Array.isArray(options.origin)
        ? options.origin[0]
        : undefined
  ) ?? "http://127.0.0.1:5173";
  const secureCookies = options.secureCookies ?? primaryOrigin.startsWith("https://");
  // GET /api/v1/auth/oauth/:provider/start
  app.get("/api/v1/auth/oauth/:provider/start", async (request, reply) => {
    try {
      cleanupExpiredStates();
      const { provider } = request.params as { provider: string };
      const normalized = provider.toLowerCase();

      if (BLOCKED_OAUTH_PROVIDERS.has(normalized)) {
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

      if (!SUPPORTED_OAUTH_PROVIDERS.has(normalized)) {
        return reject(reply, request, new AuthError(400, "VALIDATION_ERROR"));
      }

      if (!options.profileResolver) {
        return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
      }

      // Check if an existing session is provided (for account linking)
      let currentUserId: string | undefined;
      if (options.db && request.headers.cookie) {
        try {
          const identity = await requireSession(
            options.db,
            request,
            options.origin,
            secureCookies,
            false,
          );
          currentUserId = identity.userId;
        } catch {
          // Not authenticated, this is a login/signup attempt
        }
      }

      const state = randomBytes(24).toString("base64url");
      const codeVerifier = randomBytes(32).toString("base64url");
      const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

      pendingOAuthStates.set(state, {
        provider: normalized,
        codeVerifier,
        userId: currentUserId,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const redirectUri = `${primaryOrigin}/auth/oauth/${normalized}/callback`;
      let redirectUrl: string;

      if (normalized === "google") {
        redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client-id&redirect_uri=${encodeURIComponent(
          redirectUri,
        )}&response_type=code&scope=openid%20email%20profile&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      } else if (normalized === "github") {
        redirectUrl = `https://github.com/login/oauth/authorize?client_id=github-client-id&redirect_uri=${encodeURIComponent(
          redirectUri,
        )}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256&scope=read:user%20user:email`;
      } else {
        redirectUrl = `https://${normalized}.test/oauth/authorize?state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      }

      return oAuthRedirectSchema.parse({ redirectUrl });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  // GET /api/v1/auth/oauth/:provider/callback
  app.get("/api/v1/auth/oauth/:provider/callback", async (request, reply) => {
    try {
      cleanupExpiredStates();
      if (!options.db) return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));

      const { provider } = request.params as { provider: string };
      const normalized = provider.toLowerCase();

      if (BLOCKED_OAUTH_PROVIDERS.has(normalized)) {
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

      const resolveProfile = options.profileResolver;
      if (!resolveProfile) {
        return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
      }

      const query = request.query as Record<string, unknown>;
      const parsed = oAuthCallbackSchema.safeParse(query);
      if (!parsed.success) {
        return reject(reply, request, new AuthError(400, "VALIDATION_ERROR"));
      }

      const { code, state } = parsed.data;
      const pending = pendingOAuthStates.get(state);
      if (!pending || pending.expiresAt <= Date.now()) {
        pendingOAuthStates.delete(state);
        return reject(reply, request, new AuthError(400, "INVALID_OAUTH_STATE"));
      }

      if (pending.provider !== normalized) {
        pendingOAuthStates.delete(state);
        return reject(reply, request, new AuthError(400, "INVALID_OAUTH_STATE"));
      }

      // Single-use state
      pendingOAuthStates.delete(state);

      let profile: OAuthUserProfile;
      try {
        profile = await resolveProfile(normalized, code, pending.codeVerifier);
      } catch {
        return reject(reply, request, new AuthError(502, "OAUTH_PROVIDER_FAILED"));
      }

      const db = options.db;

      // Linking flow: user was logged in when OAuth started
      if (pending.userId) {
        const existing = await db.query<{ id: string; user_id: string }>(
          "SELECT id, user_id FROM auth_identities WHERE provider = $1 AND provider_subject = $2",
          [normalized, profile.providerSubject],
        );

        if (existing.rows.length > 0) {
          if (existing.rows[0]!.user_id !== pending.userId) {
            return reject(reply, request, new AuthError(409, "IDENTITY_ALREADY_LINKED"));
          }
          // Already linked to this user, return current user view
          const u = await db.query<{
            id: string;
            email_normalized: string;
            display_name: string;
            created_at: Date;
          }>("SELECT id, email_normalized, display_name, created_at FROM users WHERE id = $1", [
            pending.userId,
          ]);
          const userRow = u.rows[0]!;
          return userViewSchema.parse({
            id: userRow.id,
            email: userRow.email_normalized,
            displayName: userRow.display_name,
            createdAt: userRow.created_at.toISOString(),
          });
        }

        await db.query(
          "INSERT INTO auth_identities (user_id, provider, provider_subject) VALUES ($1, $2, $3)",
          [pending.userId, normalized, profile.providerSubject],
        );

        const u = await db.query<{
          id: string;
          email_normalized: string;
          display_name: string;
          created_at: Date;
        }>("SELECT id, email_normalized, display_name, created_at FROM users WHERE id = $1", [
          pending.userId,
        ]);
        const userRow = u.rows[0]!;
        return userViewSchema.parse({
          id: userRow.id,
          email: userRow.email_normalized,
          displayName: userRow.display_name,
          createdAt: userRow.created_at.toISOString(),
        });
      }

      // Login or registration flow (unauthenticated user)
      const existingIdentity = await db.query<{ user_id: string }>(
        "SELECT user_id FROM auth_identities WHERE provider = $1 AND provider_subject = $2",
        [normalized, profile.providerSubject],
      );

      let targetUserId: string;

      if (existingIdentity.rows.length > 0) {
        targetUserId = existingIdentity.rows[0]!.user_id;
        const targetUser = await db.query<{ id: string; disabled_at: Date | null }>(
          "SELECT id, disabled_at FROM users WHERE id = $1",
          [targetUserId],
        );
        if (targetUser.rows[0]?.disabled_at) {
          return reject(reply, request, new AuthError(403, "ACCOUNT_DISABLED"));
        }
      } else {
        // Check if user exists by email
        const normalizedEmail = normalizeEmail(profile.email);
        const existingUser = await db.query<{ id: string; disabled_at: Date | null }>(
          "SELECT id, disabled_at FROM users WHERE email_normalized = $1",
          [normalizedEmail],
        );

        if (existingUser.rows.length > 0) {
          if (existingUser.rows[0]!.disabled_at) {
            return reject(reply, request, new AuthError(403, "ACCOUNT_DISABLED"));
          }
          targetUserId = existingUser.rows[0]!.id;
          await db.query(
            "INSERT INTO auth_identities (user_id, provider, provider_subject) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            [targetUserId, normalized, profile.providerSubject],
          );
        } else {
          // Public registration check
          if (process.env.PUBLIC_SIGNUP_ENABLED !== "true") {
            return reject(reply, request, new AuthError(403, "REGISTRATION_DENIED"));
          }

          const newUser = await db.query<{ id: string }>(
            `INSERT INTO users (email_normalized, display_name, email_verified_at)
             VALUES ($1, $2, NOW()) RETURNING id`,
            [normalizedEmail, profile.displayName || "OAuth User"],
          );
          targetUserId = newUser.rows[0]!.id;
          await db.query(
            "INSERT INTO auth_identities (user_id, provider, provider_subject) VALUES ($1, $2, $3)",
            [targetUserId, normalized, profile.providerSubject],
          );
        }
      }

      const sessionIssue = await createSessionForUserId(db, targetUserId, request.id);

      return reply
        .header(
          "set-cookie",
          sessionCookie(sessionIssue.token, secureCookies, sessionIssue.expiresAt),
        )
        .header("x-csrf-token", sessionIssue.csrf)
        .code(200)
        .send(sessionIssue.user);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  // DELETE /api/v1/auth/oauth/:provider and DELETE /api/v1/me/identities/:provider (Unlink)
  const unlinkHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!options.db) return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));

      const identity = await requireSession(
        options.db,
        request,
        options.origin,
        secureCookies,
        true,
      );
      const { provider } = request.params as { provider: string };
      const normalized = provider.toLowerCase();

      const existing = await options.db.query<{ id: string }>(
        "SELECT id FROM auth_identities WHERE user_id = $1 AND provider = $2",
        [identity.userId, normalized],
      );

      if (existing.rows.length === 0) {
        return reject(reply, request, new AuthError(404, "RESOURCE_NOT_FOUND"));
      }

      // Safety invariant: Ensure the user retains at least one way to sign in
      const userRow = await options.db.query<{ password_hash: string | null }>(
        "SELECT password_hash FROM users WHERE id = $1",
        [identity.userId],
      );
      const otherIdentities = await options.db.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM auth_identities WHERE user_id = $1 AND provider <> $2",
        [identity.userId, normalized],
      );

      const hasPassword = Boolean(userRow.rows[0]?.password_hash);
      const otherCount = parseInt(otherIdentities.rows[0]?.count ?? "0", 10);

      if (!hasPassword && otherCount === 0) {
        return reject(reply, request, new AuthError(409, "CANNOT_UNLINK_LAST_AUTH_METHOD"));
      }

      await options.db.query("DELETE FROM auth_identities WHERE user_id = $1 AND provider = $2", [
        identity.userId,
        normalized,
      ]);

      return reply.code(204).send();
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  };

  app.delete("/api/v1/auth/oauth/:provider", unlinkHandler);
  app.delete("/api/v1/me/identities/:provider", unlinkHandler);

  // GET /api/v1/auth/oauth/identities
  app.get("/api/v1/auth/oauth/identities", async (request, reply) => {
    try {
      if (!options.db) return reject(reply, request, new AuthError(503, "SERVICE_UNAVAILABLE"));
      const identity = await requireSession(
        options.db,
        request,
        options.origin,
        secureCookies,
        false,
      );

      const rows = await options.db.query<{ provider: string; provider_subject: string }>(
        "SELECT provider, provider_subject FROM auth_identities WHERE user_id = $1 ORDER BY provider ASC",
        [identity.userId],
      );

      return {
        identities: rows.rows.map((r) => ({
          provider: r.provider,
          providerSubject: r.provider_subject,
        })),
      };
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
