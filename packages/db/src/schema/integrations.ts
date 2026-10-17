import {
  bigint,
  boolean,
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users, projects } from "./core.js";

export const externalConnections = pgTable("external_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedCredentialRef: text("encrypted_credential_ref").notNull(),
  scopesJson: jsonb("scopes_json").notNull().default([]),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const projectIntegrations = pgTable(
  "project_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => externalConnections.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    remoteRef: text("remote_ref").notNull(),
    branch: text("branch"),
    lastSyncedRevision: text("last_synced_revision"),
    syncCursor: text("sync_cursor"),
    syncBaseManifest: jsonb("sync_base_manifest"),
  },
  (table) => [
    uniqueIndex("project_integrations_project_provider_remote_idx").on(
      table.projectId,
      table.provider,
      table.remoteRef,
    ),
  ],
);

export const githubSyncRequests = pgTable(
  "github_sync_requests",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    resultJson: jsonb("result_json"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("github_sync_requests_actor_key_idx").on(
      table.projectId,
      table.actorId,
      table.idempotencyKey,
    ),
  ],
);

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  sourceManifestKey: text("source_manifest_key").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  version: text("version").notNull().default("1.0.0"),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  metadataRedacted: jsonb("metadata_redacted").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  requestId: uuid("request_id").notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payloadJson: jsonb("payload_json").notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const usageQuotas = pgTable(
  "usage_quotas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    metric: text("metric").notNull(),
    maxValue: bigint("max_value", { mode: "number" }).notNull(),
    window: text("window").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("usage_quotas_subject_metric_window_idx").on(
      table.subjectType,
      table.subjectId,
      table.metric,
      table.window,
    ),
    check("usage_quotas_max_value_check", sql`${table.maxValue} >= 0`),
  ],
);

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  scope: text("scope").notNull().default("global"),
  configurationJson: jsonb("configuration_json").notNull().default({}),
});
