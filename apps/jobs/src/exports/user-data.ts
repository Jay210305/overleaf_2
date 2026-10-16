import type { DatabaseClient } from "@latex-collab/db";

export interface UserAccountExport {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface UserPreferencesExport {
  locale: string;
  timezone: string;
  theme: string;
  editorSettings: unknown;
  notificationSettings: unknown;
}

export interface UserSessionExport {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface UserProjectExport {
  id: string;
  title: string;
  description: string | null;
  compiler: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserTagExport {
  id: string;
  name: string;
  color: string;
}

export interface UserMembershipExport {
  projectId: string;
  projectTitle: string;
  role: string;
  joinedAt: string;
}

export interface UserExportBundle {
  exportVersion: "1.0";
  generatedAt: string;
  account: UserAccountExport;
  preferences: UserPreferencesExport | null;
  sessions: UserSessionExport[];
  ownedProjects: UserProjectExport[];
  tags: UserTagExport[];
  memberships: UserMembershipExport[];
}

export interface ExportJobResult {
  exportId: string;
  userId: string;
  downloadUrl: string;
  expiresAt: string;
  bundle: UserExportBundle;
}

/**
 * Gathers all authorized personal data for a user in GDPR-compliant JSON format.
 * Invariants:
 * - Excludes password_hash, token_hash, and session secrets.
 * - Shared project memberships are described without leaking other users' emails or credentials.
 */
export async function generateUserExportData(
  db: { query: DatabaseClient["query"] },
  userId: string,
): Promise<UserExportBundle> {
  // 1. Account info
  const userRes = await db.query<{
    id: string;
    email: string;
    display_name: string;
    created_at: Date;
  }>(
    `SELECT id, email_normalized AS email, display_name, created_at
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const user = userRes.rows[0];
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // 2. Preferences
  const prefRes = await db.query<{
    locale: string;
    timezone: string;
    theme: string;
    editor_settings_json: unknown;
    notification_settings_json: unknown;
  }>(
    `SELECT locale, timezone, theme, editor_settings_json, notification_settings_json
     FROM user_preferences
     WHERE user_id = $1`,
    [userId],
  );

  const pref = prefRes.rows[0];

  // 3. Sessions (excluding token_hash)
  const sessionsRes = await db.query<{
    id: string;
    device_label: string;
    created_at: Date;
    last_seen_at: Date;
    expires_at: Date;
  }>(
    `SELECT id, device_label, created_at, last_seen_at, expires_at
     FROM sessions
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY last_seen_at DESC`,
    [userId],
  );

  // 4. Owned projects
  const projectsRes = await db.query<{
    id: string;
    title: string;
    description: string | null;
    compiler: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, title, description, compiler, status, created_at, updated_at
     FROM projects
     WHERE owner_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  // 5. Tags
  const tagsRes = await db.query<{
    id: string;
    name: string;
    color: string;
  }>(
    `SELECT id, name, color
     FROM project_tags
     WHERE user_id = $1
     ORDER BY name ASC`,
    [userId],
  );

  // 6. Shared project memberships (joined without exposing other members' private info)
  const membershipsRes = await db.query<{
    project_id: string;
    project_title: string;
    role: string;
    joined_at: Date;
  }>(
    `SELECT pm.project_id, p.title AS project_title, pm.role, pm.joined_at
     FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.user_id = $1 AND pm.revoked_at IS NULL AND p.owner_id != $1
     ORDER BY pm.joined_at DESC`,
    [userId],
  );

  return {
    exportVersion: "1.0",
    generatedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at.toISOString(),
    },
    preferences: pref
      ? {
          locale: pref.locale,
          timezone: pref.timezone,
          theme: pref.theme,
          editorSettings: pref.editor_settings_json,
          notificationSettings: pref.notification_settings_json,
        }
      : null,
    sessions: sessionsRes.rows.map((s) => ({
      id: s.id,
      deviceLabel: s.device_label,
      createdAt: s.created_at.toISOString(),
      lastSeenAt: s.last_seen_at.toISOString(),
      expiresAt: s.expires_at.toISOString(),
    })),
    ownedProjects: projectsRes.rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      compiler: p.compiler,
      status: p.status,
      createdAt: p.created_at.toISOString(),
      updatedAt: p.updated_at.toISOString(),
    })),
    tags: tagsRes.rows.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    })),
    memberships: membershipsRes.rows.map((m) => ({
      projectId: m.project_id,
      projectTitle: m.project_title,
      role: m.role,
      joinedAt: m.joined_at.toISOString(),
    })),
  };
}

/**
 * Creates an export artifact bundle and returns expiring access details.
 */
export async function createUserExportArchive(
  db: { query: DatabaseClient["query"] },
  userId: string,
): Promise<ExportJobResult> {
  const bundle = await generateUserExportData(db, userId);
  const exportId = `export-${userId}-${Date.now()}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hour expiry

  return {
    exportId,
    userId,
    downloadUrl: `/api/v1/me/data-export/${exportId}`,
    expiresAt,
    bundle,
  };
}
