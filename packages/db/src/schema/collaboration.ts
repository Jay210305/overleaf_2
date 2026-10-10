import {
  bigint,
  customType,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users, projects, projectNodes, textDocuments } from "./core.js";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const commentStatuses = ["open", "resolved", "detached"] as const;
export type CommentStatus = (typeof commentStatuses)[number];

export const suggestionStatuses = ["pending", "accepted", "rejected", "conflict"] as const;
export type SuggestionStatus = (typeof suggestionStatuses)[number];

export const crdtUpdates = pgTable(
  "crdt_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => textDocuments.fileId, { onDelete: "cascade" }),
    seq: bigint("seq", { mode: "number" }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    payloadBytes: bytea("payload_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crdt_updates_file_seq_idx").on(table.fileId, table.seq),
    check("crdt_updates_seq_check", sql`${table.seq} >= 0`),
  ],
);

export const crdtSnapshots = pgTable(
  "crdt_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => textDocuments.fileId, { onDelete: "cascade" }),
    uptoSeq: bigint("upto_seq", { mode: "number" }).notNull(),
    stateBytes: bytea("state_bytes"),
    blobKey: text("blob_key"),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("crdt_snapshots_file_upto_seq_idx").on(table.fileId, table.uptoSeq),
    check("crdt_snapshots_upto_seq_check", sql`${table.uptoSeq} >= 0`),
    check(
      "crdt_snapshots_storage_check",
      sql`(${table.stateBytes} IS NOT NULL AND ${table.blobKey} IS NULL) OR (${table.stateBytes} IS NULL AND ${table.blobKey} IS NOT NULL)`,
    ),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => projectNodes.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    anchorStartJson: jsonb("anchor_start_json").notNull(),
    anchorEndJson: jsonb("anchor_end_json").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.fileId],
      foreignColumns: [projectNodes.projectId, projectNodes.id],
      name: "comments_same_project_file_fk",
    }).onDelete("cascade"),
    check("comments_status_check", sql`${table.status} IN ('open', 'resolved', 'detached')`),
  ],
);

export const commentReplies = pgTable("comment_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  commentId: uuid("comment_id")
    .notNull()
    .references(() => comments.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
});

export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => projectNodes.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    baseRevision: text("base_revision").notNull(),
    anchorJson: jsonb("anchor_json").notNull(),
    oldTextHash: text("old_text_hash").notNull(),
    newText: text("new_text").notNull(),
    status: text("status").notNull().default("pending"),
    resolvedBy: text("resolved_by"),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.fileId],
      foreignColumns: [projectNodes.projectId, projectNodes.id],
      name: "suggestions_same_project_file_fk",
    }).onDelete("cascade"),
    check(
      "suggestions_status_check",
      sql`${table.status} IN ('pending', 'accepted', 'rejected', 'conflict')`,
    ),
  ],
);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
});
