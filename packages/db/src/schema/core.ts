import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roles = ["OWNER", "EDITOR", "REVIEWER", "VIEWER"] as const;
export type Role = (typeof roles)[number];

export const compilers = ["pdflatex", "xelatex", "lualatex", "latex"] as const;
export type Compiler = (typeof compilers)[number];

export const projectStatuses = ["active", "archived", "trashed"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const nodeKinds = ["FILE", "FOLDER"] as const;
export type NodeKind = (typeof nodeKinds)[number];

export const contentKinds = ["TEXT", "BINARY"] as const;
export type ContentKind = (typeof contentKinds)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailNormalized: text("email_normalized").notNull().unique(),
    passwordHash: text("password_hash"),
    displayName: text("display_name").notNull(),
    avatarKey: text("avatar_key"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [uniqueIndex("users_email_normalized_idx").on(table.emailNormalized)],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  theme: text("theme").notNull().default("system"),
  editorSettingsJson: jsonb("editor_settings_json").notNull().default({}),
  notificationSettingsJson: jsonb("notification_settings_json").notNull().default({}),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    csrfHash: text("csrf_hash"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    deviceLabel: text("device_label").notNull(),
  },
  (table) => [uniqueIndex("sessions_token_hash_idx").on(table.tokenHash)],
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_idx").on(table.provider, table.providerSubject),
  ],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [uniqueIndex("verification_tokens_token_hash_idx").on(table.tokenHash)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    mainFileId: uuid("main_file_id"),
    compiler: text("compiler").notNull().default("pdflatex"),
    texliveImageVersion: text("texlive_image_version").notNull().default("2024.1"),
    status: text("status").notNull().default("active"),
    currentRevision: bigint("current_revision", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("projects_current_revision_check", sql`${table.currentRevision} >= 0`),
    check(
      "projects_compiler_check",
      sql`${table.compiler} IN ('pdflatex', 'xelatex', 'lualatex', 'latex')`,
    ),
    check("projects_status_check", sql`${table.status} IN ('active', 'archived', 'trashed')`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    check(
      "project_members_role_check",
      sql`${table.role} IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER')`,
    ),
  ],
);

export const projectInvitations = pgTable(
  "project_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    emailNormalized: text("email_normalized").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    invitedBy: text("invited_by").notNull(),
  },
  (table) => [
    uniqueIndex("project_invitations_token_hash_idx").on(table.tokenHash),
    uniqueIndex("project_invitations_pending_email_uidx")
      .on(table.projectId, table.emailNormalized)
      .where(
        sql`${table.acceptedAt} IS NULL AND ${table.rejectedAt} IS NULL AND ${table.revokedAt} IS NULL`,
      ),
    check("project_invitations_role_check", sql`${table.role} IN ('EDITOR', 'REVIEWER', 'VIEWER')`),
  ],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    role: text("role").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    maxUses: bigint("max_uses", { mode: "number" }),
    useCount: bigint("use_count", { mode: "number" }).notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("share_links_token_hash_idx").on(table.tokenHash),
    check(
      "share_links_role_check",
      sql`${table.role} IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER')`,
    ),
    check("share_links_use_count_check", sql`${table.useCount} >= 0`),
    check("share_links_max_uses_check", sql`${table.maxUses} IS NULL OR ${table.maxUses} >= 0`),
  ],
);

export const projectNodes = pgTable(
  "project_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    contentKind: text("content_kind").notNull(),
    blobKey: text("blob_key"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("project_nodes_project_id_id_idx").on(table.projectId, table.id),
    foreignKey({
      columns: [table.projectId, table.parentId],
      foreignColumns: [table.projectId, table.id],
      name: "project_nodes_same_project_parent_fk",
    }).onDelete("cascade"),
    uniqueIndex("project_nodes_active_root_unique_idx")
      .on(table.projectId, table.name)
      .where(sql`${table.parentId} IS NULL AND ${table.deletedAt} IS NULL`),
    uniqueIndex("project_nodes_active_sibling_unique_idx")
      .on(table.projectId, table.parentId, table.name)
      .where(sql`${table.parentId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    check("project_nodes_kind_check", sql`${table.kind} IN ('FILE', 'FOLDER')`),
    check("project_nodes_content_kind_check", sql`${table.contentKind} IN ('TEXT', 'BINARY')`),
    check("project_nodes_size_bytes_check", sql`${table.sizeBytes} >= 0`),
  ],
);

export const pendingUploads = pgTable(
  "pending_uploads",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    contentKind: text("content_kind").notNull(),
    expectedSize: bigint("expected_size", { mode: "number" }).notNull(),
    expectedSha256: text("expected_sha256").notNull(),
    stagingKey: text("staging_key").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    completedNodeId: uuid("completed_node_id").references(() => projectNodes.id, {
      onDelete: "cascade",
    }),
    completedKeyHash: text("completed_key_hash"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("pending_uploads_project_expiry_idx")
      .on(table.projectId, table.expiresAt)
      .where(sql`${table.completedNodeId} IS NULL`),
    check("pending_uploads_content_kind_check", sql`${table.contentKind} IN ('TEXT', 'BINARY')`),
    check(
      "pending_uploads_expected_size_check",
      sql`${table.expectedSize} > 0 AND ${table.expectedSize} <= 26214400`,
    ),
    check(
      "pending_uploads_completion_pair",
      sql`(${table.completedNodeId} IS NULL AND ${table.completedKeyHash} IS NULL) OR (${table.completedNodeId} IS NOT NULL AND ${table.completedKeyHash} IS NOT NULL)`,
    ),
  ],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    archiveSha256: text("archive_sha256").notNull(),
    archiveSize: bigint("archive_size", { mode: "number" }).notNull(),
    title: text("title").notNull(),
    archiveKey: text("archive_key").notNull().unique(),
    status: text("status").notNull().default("staging"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    attempts: integer("attempts").notNull().default(0),
    manifest: jsonb("manifest"),
    manifestVersion: integer("manifest_version"),
    errorCode: text("error_code"),
    archiveSwept: boolean("archive_swept").notNull().default(false),
    pendingProjectId: uuid("pending_project_id"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("import_jobs_actor_key_uidx").on(table.actorId, table.idempotencyKeyHash),
    index("import_jobs_claim_idx")
      .on(table.status, table.leaseExpiresAt, table.createdAt)
      .where(sql`${table.status} IN ('queued', 'validating')`),
    index("import_jobs_sweep_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'failed' AND ${table.archiveSwept} = FALSE`),
    check(
      "import_jobs_archive_size_check",
      sql`${table.archiveSize} > 0 AND ${table.archiveSize} <= 26214400`,
    ),
  ],
);

export const importUploadIntents = pgTable(
  "import_upload_intents",
  {
    id: uuid("id").primaryKey(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expectedSize: bigint("expected_size", { mode: "number" }).notNull(),
    expectedSha256: text("expected_sha256").notNull(),
    stagingKey: text("staging_key").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    completedJobId: uuid("completed_job_id").references(() => importJobs.id, {
      onDelete: "set null",
    }),
    completedKeyHash: text("completed_key_hash"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("import_upload_intents_actor_expiry_idx")
      .on(table.actorId, table.expiresAt)
      .where(sql`${table.completedJobId} IS NULL`),
    check(
      "import_upload_intents_expected_size_check",
      sql`${table.expectedSize} > 0 AND ${table.expectedSize} <= 26214400`,
    ),
  ],
);

export const projectTags = pgTable(
  "project_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (table) => [uniqueIndex("project_tags_user_name_idx").on(table.userId, table.name)],
);

export const projectTagLinks = pgTable(
  "project_tag_links",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => projectTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.tagId] })],
);

export const textDocuments = pgTable(
  "text_documents",
  {
    fileId: uuid("file_id")
      .primaryKey()
      .references(() => projectNodes.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    latestSnapshotId: uuid("latest_snapshot_id"),
    lastPersistedSeq: bigint("last_persisted_seq", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.fileId],
      foreignColumns: [projectNodes.projectId, projectNodes.id],
      name: "text_documents_same_project_file_fk",
    }).onDelete("cascade"),
    check("text_documents_last_persisted_seq_check", sql`${table.lastPersistedSeq} >= 0`),
  ],
);

export const projectRevisions = pgTable(
  "project_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revisionNo: bigint("revision_no", { mode: "number" }).notNull(),
    manifestKey: text("manifest_key").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    label: text("label"),
  },
  (table) => [
    uniqueIndex("project_revisions_project_revision_no_idx").on(table.projectId, table.revisionNo),
    check("project_revisions_revision_no_check", sql`${table.revisionNo} >= 0`),
  ],
);

export const revisionItems = pgTable(
  "revision_items",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => projectRevisions.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => projectNodes.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    blobKey: text("blob_key").notNull(),
    sha256: text("sha256").notNull(),
    deleted: boolean("deleted").notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.revisionId, table.path] })],
);

export const compileJobs = pgTable(
  "compile_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").notNull(),
    sourceRevisionId: uuid("source_revision_id")
      .notNull()
      .references(() => projectRevisions.id, { onDelete: "restrict" }),
    targetRevisionId: uuid("target_revision_id").references(() => projectRevisions.id, {
      onDelete: "set null",
    }),
    engine: text("engine").notNull(),
    optionsHash: text("options_hash").notNull(),
    status: text("status").notNull(),
    queueId: uuid("queue_id"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    errorCode: text("error_code"),
    artifactSetId: uuid("artifact_set_id"),
    idempotencyKeyHash: text("idempotency_key_hash"),
    forceClean: boolean("force_clean").notNull().default(false),
    diagnostics: jsonb("diagnostics").notNull().default([]),
    pdfAvailable: boolean("pdf_available").notNull().default(false),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("compile_jobs_actor_key_uidx")
      .on(table.requestedBy, table.projectId, table.idempotencyKeyHash)
      .where(sql`${table.idempotencyKeyHash} IS NOT NULL`),
    index("compile_jobs_project_time_idx").on(table.projectId, table.startedAt),
    index("compile_jobs_project_created_idx").on(table.projectId, table.createdAt),
    index("compile_jobs_active_quota_idx")
      .on(table.projectId, table.requestedBy, table.status)
      .where(sql`${table.status} IN ('queued', 'running', 'cancel_requested')`),
    index("compile_jobs_claim_idx")
      .on(table.status, table.leaseExpiresAt, table.createdAt)
      .where(sql`${table.status} IN ('queued', 'running')`),
    check(
      "compile_jobs_engine_check",
      sql`${table.engine} IN ('pdflatex', 'xelatex', 'lualatex', 'latex')`,
    ),
    check(
      "compile_jobs_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancel_requested', 'cancelled')`,
    ),
  ],
);

export const artifactSets = pgTable(
  "artifact_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    compileJobId: uuid("compile_job_id")
      .notNull()
      .unique()
      .references(() => compileJobs.id, { onDelete: "cascade" }),
    pdfKey: text("pdf_key"),
    logKey: text("log_key"),
    synctexKey: text("synctex_key"),
    auxManifestKey: text("aux_manifest_key"),
    sourceHash: text("source_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [uniqueIndex("artifact_sets_compile_job_id_idx").on(table.compileJobId)],
);
