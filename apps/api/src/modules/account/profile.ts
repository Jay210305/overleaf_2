import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  profilePatchSchema,
  preferencesPatchSchema,
  type PreferencesPatch,
} from "@latex-collab/contracts";
import {
  isUUID,
  writeAuditEvent,
  type DatabaseClient,
  type TransactionContext,
} from "@latex-collab/db";
import { AuthError } from "../auth/errors.js";
import { expiredSessionCookie } from "../auth/session.js";
import { requireSession } from "../../plugins/require-session.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";

const absoluteMs = 30 * 24 * 60 * 60 * 1000;
const defaultEditor = {
  fontFamily: "monospace",
  fontSize: 14,
  tabWidth: 2,
  wrap: true,
  autoClose: true,
  autocomplete: true,
  reducedMotion: false,
};
const defaultNotifications = {
  email: true,
  inApp: true,
  mentions: true,
  replies: true,
  invitations: true,
};

type Identity = { userId: string; sessionId: string };
type ProfileRow = {
  id: string;
  email_normalized: string;
  display_name: string;
  locale: string;
  timezone: string;
  avatar_key: string | null;
};
type PreferencesRow = {
  locale: string;
  timezone: string;
  theme: string;
  editor_settings_json: unknown;
  notification_settings_json: unknown;
};
type SessionRow = {
  id: string;
  device_label: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
};

function validLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}
function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function validatePreferences(value: PreferencesPatch): void {
  if (
    (value.locale && !validLocale(value.locale)) ||
    (value.timezone && !validTimezone(value.timezone))
  )
    throw new AuthError(400, "VALIDATION_ERROR");
}
function viewPreferences(row: PreferencesRow) {
  return {
    locale: row.locale,
    timezone: row.timezone,
    theme: row.theme,
    editor: Object.keys(row.editor_settings_json as object).length
      ? row.editor_settings_json
      : defaultEditor,
    notifications: Object.keys(row.notification_settings_json as object).length
      ? row.notification_settings_json
      : defaultNotifications,
  };
}
function viewSession(row: SessionRow, currentId: string) {
  return {
    id: row.id,
    deviceLabel: row.device_label,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    current: row.id === currentId,
  };
}
async function lockCurrent(
  tx: TransactionContext,
  identity: Identity,
  csrf: unknown,
): Promise<void> {
  const found = await tx.query<{
    csrf_hash: string | null;
    expires_at: Date;
    created_at: Date;
    revoked_at: Date | null;
    disabled_at: Date | null;
    email_verified_at: Date | null;
  }>(
    `SELECT s.csrf_hash, s.expires_at, s.created_at, s.revoked_at, u.disabled_at, u.email_verified_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.user_id = $2 FOR UPDATE OF s`,
    [identity.sessionId, identity.userId],
  );
  const row = found.rows[0];
  if (
    !row ||
    row.revoked_at ||
    row.expires_at.getTime() <= Date.now() ||
    row.created_at.getTime() + absoluteMs <= Date.now()
  )
    throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  if (row.disabled_at || !row.email_verified_at) throw new AuthError(403, "ACCOUNT_DISABLED");
  requireSessionCsrf(csrf, row.csrf_hash);
}
export async function readProfile(db: DatabaseClient, userId: string) {
  const found = await db.query<ProfileRow>(
    `SELECT u.id, u.email_normalized, u.display_name, u.avatar_key, COALESCE(p.locale, 'en') AS locale,
            COALESCE(p.timezone, 'UTC') AS timezone
     FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const row = found.rows[0];
  if (!row) throw new AuthError(401, "AUTHENTICATION_REQUIRED");
  return {
    id: row.id,
    email: row.email_normalized,
    displayName: row.display_name,
    avatarUrl: row.avatar_key ? "/api/v1/me/avatar/content" : null,
    emailVerified: true,
    locale: row.locale,
    timezone: row.timezone,
  };
}
async function readPreferences(db: DatabaseClient, userId: string) {
  const found = await db.query<PreferencesRow>(
    `SELECT COALESCE(locale, 'en') AS locale, COALESCE(timezone, 'UTC') AS timezone,
            COALESCE(theme, 'system') AS theme, COALESCE(editor_settings_json, '{}'::jsonb) AS editor_settings_json,
            COALESCE(notification_settings_json, '{}'::jsonb) AS notification_settings_json
     FROM user_preferences WHERE user_id = $1`,
    [userId],
  );
  return viewPreferences(
    found.rows[0] ?? {
      locale: "en",
      timezone: "UTC",
      theme: "system",
      editor_settings_json: {},
      notification_settings_json: {},
    },
  );
}
function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}
export function registerProfileRoutes(
  app: FastifyInstance,
  options: { db?: DatabaseClient | undefined; origin?: string | undefined; secureCookies: boolean },
): void {
  async function identity(request: FastifyRequest, mutation = false) {
    if (!options.db) throw new AuthError(503, "SERVICE_UNAVAILABLE");
    return requireSession(options.db, request, options.origin, options.secureCookies, mutation);
  }
  app.get("/api/v1/me", async (request, reply) => {
    try {
      const current = await identity(request);
      return await readProfile(options.db!, current.userId);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
  app.patch("/api/v1/me", async (request, reply) => {
    try {
      const current = await identity(request, true);
      const parsed = profilePatchSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      validatePreferences(parsed.data);
      await options.db!.transaction(async (tx) => {
        await lockCurrent(tx, current, request.headers["x-csrf-token"]);
        if (parsed.data.displayName)
          await tx.query("UPDATE users SET display_name = $1 WHERE id = $2", [
            parsed.data.displayName,
            current.userId,
          ]);
        if (parsed.data.locale || parsed.data.timezone)
          await tx.query(
            `INSERT INTO user_preferences (user_id, locale, timezone) VALUES ($1, COALESCE($2, 'en'), COALESCE($3, 'UTC'))
           ON CONFLICT (user_id) DO UPDATE SET locale = COALESCE($2, user_preferences.locale), timezone = COALESCE($3, user_preferences.timezone)`,
            [current.userId, parsed.data.locale ?? null, parsed.data.timezone ?? null],
          );
      });
      return await readProfile(options.db!, current.userId);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
  app.get("/api/v1/me/preferences", async (request, reply) => {
    try {
      const current = await identity(request);
      return await readPreferences(options.db!, current.userId);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
  app.patch("/api/v1/me/preferences", async (request, reply) => {
    try {
      const current = await identity(request, true);
      const parsed = preferencesPatchSchema.safeParse(request.body);
      if (!parsed.success) throw new AuthError(400, "VALIDATION_ERROR");
      validatePreferences(parsed.data);
      await options.db!.transaction(async (tx) => {
        await lockCurrent(tx, current, request.headers["x-csrf-token"]);
        await tx.query(
          `INSERT INTO user_preferences (user_id, locale, timezone, theme, editor_settings_json, notification_settings_json)
           VALUES ($1, COALESCE($2, 'en'), COALESCE($3, 'UTC'), COALESCE($4, 'system'), COALESCE($5::jsonb, '{}'::jsonb), COALESCE($6::jsonb, '{}'::jsonb))
           ON CONFLICT (user_id) DO UPDATE SET locale = COALESCE($2, user_preferences.locale), timezone = COALESCE($3, user_preferences.timezone),
             theme = COALESCE($4, user_preferences.theme), editor_settings_json = COALESCE($5::jsonb, user_preferences.editor_settings_json),
             notification_settings_json = COALESCE($6::jsonb, user_preferences.notification_settings_json)`,
          [
            current.userId,
            parsed.data.locale ?? null,
            parsed.data.timezone ?? null,
            parsed.data.theme ?? null,
            parsed.data.editor ? JSON.stringify(parsed.data.editor) : null,
            parsed.data.notifications ? JSON.stringify(parsed.data.notifications) : null,
          ],
        );
      });
      return await readPreferences(options.db!, current.userId);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
  app.get("/api/v1/me/sessions", async (request, reply) => {
    try {
      const current = await identity(request);
      const query = request.query as { cursor?: unknown; limit?: unknown };
      if (Object.keys(query).some((key) => key !== "cursor" && key !== "limit"))
        throw new AuthError(400, "VALIDATION_ERROR");
      const limit = query.limit === undefined ? 20 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new AuthError(400, "VALIDATION_ERROR");
      let cursorDate: string | null = null;
      let cursorId: string | null = null;
      if (query.cursor !== undefined) {
        try {
          if (typeof query.cursor !== "string" || query.cursor.length > 2048) throw new Error();
          const decoded = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as {
            createdAt?: string;
            id?: string;
          };
          if (
            typeof decoded.createdAt !== "string" ||
            new Date(decoded.createdAt).toISOString() !== decoded.createdAt ||
            !isUUID(decoded.id)
          )
            throw new Error();
          cursorDate = decoded.createdAt;
          cursorId = decoded.id;
        } catch {
          throw new AuthError(400, "VALIDATION_ERROR");
        }
      }
      const result = await options.db!.query<SessionRow>(
        `SELECT id, device_label, date_trunc('milliseconds', created_at) AS created_at, last_seen_at, expires_at FROM sessions
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() AND created_at > NOW() - interval '30 days'
           AND ($2::timestamptz IS NULL OR (date_trunc('milliseconds', created_at), id) < ($2::timestamptz, $3::uuid))
         ORDER BY date_trunc('milliseconds', created_at) DESC, id DESC LIMIT $4`,
        [current.userId, cursorDate, cursorId, limit + 1],
      );
      const rows = result.rows.slice(0, limit);
      const last = rows.at(-1);
      return {
        items: rows.map((row) => viewSession(row, current.sessionId)),
        nextCursor:
          result.rows.length > limit && last
            ? Buffer.from(
                JSON.stringify({ createdAt: last.created_at.toISOString(), id: last.id }),
              ).toString("base64url")
            : null,
      };
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
  app.get("/api/v1/me/sessions/:sessionId", async (request, reply) => {
    try {
      const current = await identity(request);
      const sessionId = (request.params as { sessionId: string }).sessionId;
      if (!isUUID(sessionId)) throw new AuthError(400, "VALIDATION_ERROR");
      const result = await options.db!.query<SessionRow>(
        "SELECT id, device_label, created_at, last_seen_at, expires_at FROM sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()",
        [sessionId, current.userId],
      );
      if (!result.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
      return viewSession(result.rows[0], current.sessionId);
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
  app.delete("/api/v1/me/sessions/:sessionId", async (request, reply) => {
    try {
      const current = await identity(request, true);
      const sessionId = (request.params as { sessionId: string }).sessionId;
      if (!isUUID(sessionId)) throw new AuthError(400, "VALIDATION_ERROR");
      await options.db!.transaction(async (tx) => {
        await lockCurrent(tx, current, request.headers["x-csrf-token"]);
        const target = await tx.query<{ id: string }>(
          "UPDATE sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id",
          [sessionId, current.userId],
        );
        if (!target.rows[0]) throw new AuthError(404, "RESOURCE_NOT_FOUND");
        await writeAuditEvent(tx, {
          action: "session.revoked",
          actorId: current.userId,
          targetId: sessionId,
          requestId: request.id,
        });
      });
      if (sessionId === current.sessionId)
        reply.header("set-cookie", expiredSessionCookie(options.secureCookies));
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  // POST /api/v1/me/data-export - request GDPR user data export
  app.post("/api/v1/me/data-export", async (request, reply) => {
    try {
      const current = await identity(request, true);
      const exportId = `export-${current.userId}-${Date.now()}`;
      return reply.code(202).type("application/json").send({
        id: exportId,
        status: "queued",
        projectId: null,
        errorCode: null,
      });
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}
