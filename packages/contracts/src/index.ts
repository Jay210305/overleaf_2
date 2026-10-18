import { z } from "zod";
export { z };

export const healthSchema = z.strictObject({
  status: z.enum(["live", "ready"]),
  requestId: z.string().min(1).max(10000),
});
export type HealthView = z.infer<typeof healthSchema>;

export const problemSchema = z.object({
  type: z.url(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string(),
  requestId: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ProblemView = z.infer<typeof problemSchema>;

export const roleSchema = z.enum(["OWNER", "EDITOR", "REVIEWER", "VIEWER"]);
export type Role = z.infer<typeof roleSchema>;

export const projectInvitationRoleSchema = z.enum(["EDITOR", "REVIEWER", "VIEWER"]);
export const createProjectInvitationSchema = z.strictObject({
  email: z.email().max(254),
  role: projectInvitationRoleSchema,
});
export const redeemProjectInvitationSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const projectInvitationViewSchema = z.strictObject({
  id: z.uuid(),
  projectId: z.uuid(),
  email: z.email(),
  role: projectInvitationRoleSchema,
  status: z.enum(["pending", "accepted", "rejected", "revoked", "expired"]),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type ProjectInvitationView = z.infer<typeof projectInvitationViewSchema>;
export const listProjectInvitationsSchema = z.strictObject({
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,2048}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const projectInvitationPageSchema = z.strictObject({
  items: z.array(projectInvitationViewSchema).max(100),
  nextCursor: z.string().nullable(),
});

export const shareLinkRoleSchema = z.enum(["EDITOR", "REVIEWER", "VIEWER"]);
export const createShareLinkSchema = z.strictObject({
  role: shareLinkRoleSchema,
  expiresAt: z.iso.datetime(),
  maxUses: z.number().int().min(1).max(10000).optional(),
});
export const redeemShareLinkSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const shareLinkViewSchema = z.strictObject({
  id: z.uuid(),
  projectId: z.uuid(),
  role: shareLinkRoleSchema,
  expiresAt: z.iso.datetime(),
  maxUses: z.number().int().min(1).max(10000).nullable(),
  useCount: z.number().int().nonnegative(),
  revokedAt: z.iso.datetime().nullable(),
});
export type ShareLinkView = z.infer<typeof shareLinkViewSchema>;
export const createdShareLinkSchema = z.strictObject({
  link: shareLinkViewSchema,
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const shareLinkPageSchema = z.strictObject({
  items: z.array(shareLinkViewSchema).max(100),
  nextCursor: z.string().nullable(),
});
export const listShareLinksSchema = z.strictObject({
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,2048}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const shareLinkRedemptionViewSchema = z.strictObject({
  projectId: z.uuid(),
  role: shareLinkRoleSchema,
});

export const sharingMemberViewSchema = z.strictObject({
  userId: z.uuid(),
  displayName: z.string().min(1).max(200),
  role: roleSchema,
  revokedAt: z.iso.datetime().nullable(),
});
export type SharingMemberView = z.infer<typeof sharingMemberViewSchema>;
export const sharingMemberPageSchema = z.strictObject({
  items: z.array(sharingMemberViewSchema).max(100),
  nextCursor: z.uuid().nullable(),
});
export const sharingMemberListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const sharingMemberRolePatchSchema = z.strictObject({
  role: shareLinkRoleSchema,
});

const yjsIdSchema = z.strictObject({
  client: z.number().int().nonnegative().safe(),
  clock: z.number().int().nonnegative().safe(),
});
export const relativeAnchorSchema = z
  .strictObject({
    type: yjsIdSchema.nullish(),
    tname: z.literal("content").nullish(),
    item: yjsIdSchema.nullish(),
    assoc: z.number().int().safe(),
  })
  .refine((value) => value.type != null || value.tname === "content");
export const commentBodySchema = z
  .string()
  .min(1)
  .max(10000)
  .refine(
    (value) =>
      value.trim().length > 0 &&
      !/[<>\u0000-\u001f]/u.test(value) &&
      !/\b(?:javascript|data):/iu.test(value),
  );
export const createCommentSchema = z.strictObject({
  fileId: z.uuid(),
  anchorStart: relativeAnchorSchema,
  anchorEnd: relativeAnchorSchema,
  selectedText: z.string().min(1).max(10000),
  body: commentBodySchema,
  mentions: z.array(z.uuid()).max(20).default([]),
});
export const replyRequestSchema = z.strictObject({
  body: commentBodySchema,
  mentions: z.array(z.uuid()).max(20).default([]),
});
export const commentPatchSchema = z.strictObject({ status: z.enum(["open", "resolved"]) });
export const commentListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const replyViewSchema = z.strictObject({
  id: z.uuid(),
  commentId: z.uuid(),
  authorId: z.uuid(),
  body: z.string(),
  mentions: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
});
export const commentViewSchema = z.strictObject({
  id: z.uuid(),
  projectId: z.uuid(),
  fileId: z.uuid(),
  createdBy: z.uuid(),
  body: z.string(),
  status: z.enum(["open", "resolved"]),
  createdAt: z.iso.datetime(),
  anchorStart: relativeAnchorSchema,
  anchorEnd: relativeAnchorSchema,
  selectedText: z.string(),
  mentions: z.array(z.uuid()),
  replies: z.array(replyViewSchema),
  detached: z.boolean(),
  detachedReason: z.enum(["range_changed"]).nullable(),
  start: z.number().int().nonnegative().nullable(),
  end: z.number().int().nonnegative().nullable(),
});
export type CommentView = z.infer<typeof commentViewSchema>;
export const commentPageSchema = z.strictObject({
  items: z.array(commentViewSchema).max(100),
  nextCursor: z.uuid().nullable(),
});

export const createChatMessageSchema = z.strictObject({ body: commentBodySchema });
export const chatListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const chatMessageViewSchema = z.strictObject({
  id: z.uuid(),
  projectId: z.uuid(),
  authorId: z.uuid(),
  authorName: z.string().min(1),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type ChatMessageView = z.infer<typeof chatMessageViewSchema>;
export const chatMessagePageSchema = z.strictObject({
  items: z.array(chatMessageViewSchema).max(100),
  nextCursor: z.uuid().nullable(),
});

export const notificationListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const notificationViewSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(["mention", "reply"]),
  projectId: z.uuid(),
  sourceId: z.uuid(),
  projectTitle: z.string().min(1),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type NotificationView = z.infer<typeof notificationViewSchema>;
export const notificationPageSchema = z.strictObject({
  items: z.array(notificationViewSchema).max(100),
  nextCursor: z.uuid().nullable(),
});

export const compilerSchema = z.enum(["pdflatex", "xelatex", "lualatex", "latex"]);
export type Compiler = z.infer<typeof compilerSchema>;

export const projectStatusSchema = z.enum(["active", "archived", "trashed"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const nodeKindSchema = z.enum(["FILE", "FOLDER"]);
export type NodeKind = z.infer<typeof nodeKindSchema>;

export const contentKindSchema = z.enum(["TEXT", "BINARY"]);
export type ContentKind = z.infer<typeof contentKindSchema>;

// Browser-safe User DTO (strictly excludes passwordHash, tokenHash, salt, etc.)
export const userViewSchema = z.strictObject({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  avatarUrl: z.string().url().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type UserView = z.infer<typeof userViewSchema>;

export const projectViewSchema = z.strictObject({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullable(),
  mainFileId: z.string().uuid().nullable().optional(),
  compiler: compilerSchema,
  status: projectStatusSchema,
  currentRevision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProjectView = z.infer<typeof projectViewSchema>;

export const projectListViewSchema = z.strictObject({
  items: z.array(projectViewSchema),
  nextCursor: z.string().nullable(),
});
export type ProjectListView = z.infer<typeof projectListViewSchema>;

export const projectNodeViewSchema = z.strictObject({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  name: z.string().min(1).max(255),
  kind: nodeKindSchema,
  mime: z.string().min(1).max(128),
  sizeBytes: z.number().int().nonnegative(),
  contentKind: contentKindSchema,
  treeVersion: z.number().int().nonnegative().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
});
export type ProjectNodeView = z.infer<typeof projectNodeViewSchema>;

export const uploadRequestSchema = z.strictObject({
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1).max(10000),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  parentId: z.uuid().nullable().optional(),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const uploadViewSchema = z.strictObject({
  uploadId: z.uuid(),
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
export type UploadView = z.infer<typeof uploadViewSchema>;

export const uploadCompleteSchema = z.strictObject({
  uploadId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type UploadComplete = z.infer<typeof uploadCompleteSchema>;

export const importPresignRequestSchema = z.strictObject({
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ImportPresignRequest = z.infer<typeof importPresignRequestSchema>;

export const importRequestSchema = z.strictObject({
  uploadId: z.uuid(),
  title: z.string().min(1).max(200),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const importJobStatusSchema = z.enum([
  "staging",
  "queued",
  "validating",
  "validated",
  "failed",
  "succeeded",
]);
export type ImportJobStatus = z.infer<typeof importJobStatusSchema>;

export const importJobViewSchema = z.strictObject({
  id: z.uuid(),
  status: importJobStatusSchema,
  title: z.string().min(1).max(200),
  projectId: z.uuid().nullable(),
  errorCode: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ImportJobView = z.infer<typeof importJobViewSchema>;

export const treeViewSchema = z.strictObject({
  projectId: z.string().uuid(),
  treeVersion: z.number().int().nonnegative(),
  items: z.array(projectNodeViewSchema),
});
export type TreeView = z.infer<typeof treeViewSchema>;

export const projectMemberViewSchema = z.strictObject({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  role: roleSchema,
  joinedAt: z.string().datetime(),
});
export type ProjectMemberView = z.infer<typeof projectMemberViewSchema>;

export const projectRevisionViewSchema = z.strictObject({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  revisionNo: z.number().int().nonnegative(),
  manifestHash: z.string().min(1),
  authorId: z.string().uuid().nullable(),
  source: z.string().min(1),
  createdAt: z.string().datetime(),
  label: z.string().nullable().optional(),
});
export type ProjectRevisionView = z.infer<typeof projectRevisionViewSchema>;

export const compileJobViewSchema = z.strictObject({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  engine: compilerSchema,
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  sourceRevisionId: z.string().uuid(),
  startedAt: z.string().datetime().nullable().optional(),
  finishedAt: z.string().datetime().nullable().optional(),
  errorCode: z.string().nullable().optional(),
});
export type CompileJobView = z.infer<typeof compileJobViewSchema>;

export const artifactSetViewSchema = z.strictObject({
  id: z.string().uuid(),
  compileJobId: z.string().uuid(),
  pdfKey: z.string().nullable().optional(),
  logKey: z.string().nullable().optional(),
  synctexKey: z.string().nullable().optional(),
  sourceHash: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type ArtifactSetView = z.infer<typeof artifactSetViewSchema>;

// Request DTOs
export const createProjectSchema = z.strictObject({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  compiler: compilerSchema.default("pdflatex"),
  templateId: z.string().uuid().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.strictObject({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  compiler: compilerSchema.optional(),
  status: projectStatusSchema.optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createNodeSchema = z.strictObject({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().default(null),
  kind: nodeKindSchema,
  mime: z.string().min(1).max(128).default("application/x-tex"),
  contentKind: contentKindSchema.default("TEXT"),
});
export type CreateNodeInput = z.infer<typeof createNodeSchema>;

export const moveNodeSchema = z.strictObject({
  targetParentId: z.string().uuid().nullable(),
});
export type MoveNodeInput = z.infer<typeof moveNodeSchema>;

export const renameNodeSchema = z.strictObject({
  name: z.string().min(1).max(255),
});
export type RenameNodeInput = z.infer<typeof renameNodeSchema>;

export const listProjectsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  filter: z.enum(["owned", "shared", "recent", "archived", "trashed"]).default("owned"),
  order: z.enum(["updatedAt", "owner"]).default("updatedAt"),
  tagId: z.string().uuid().optional(),
  q: z.string().min(1).max(1000).optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const registerRequestSchema = z.strictObject({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(200),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.strictObject({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const emailRequestSchema = z.strictObject({ email: z.email().max(254) });
export type EmailRequest = z.infer<typeof emailRequestSchema>;

export const passwordResetRequestSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(8).max(128),
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordChangeRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>;

export const deleteAccountRequestSchema = z
  .strictObject({
    password: z.string().min(1).max(128).optional(),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .refine((data) => Boolean(data.password || data.currentPassword), {
    message: "password or currentPassword is required",
  });
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

export const profilePatchSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(100).optional(),
    locale: z.string().min(1).max(35).optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const editorSettingsSchema = z.strictObject({
  fontFamily: z.string().min(1).max(100),
  fontSize: z.number().int().min(10).max(32),
  tabWidth: z.number().int().min(1).max(8),
  wrap: z.boolean(),
  autoClose: z.boolean(),
  autocomplete: z.boolean(),
  reducedMotion: z.boolean(),
});
export const notificationSettingsSchema = z.strictObject({
  email: z.boolean(),
  inApp: z.boolean(),
  mentions: z.boolean(),
  replies: z.boolean(),
  invitations: z.boolean(),
});
export const preferencesPatchSchema = z
  .strictObject({
    locale: z.string().min(1).max(35).optional(),
    timezone: z.string().min(1).max(64).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    editor: editorSettingsSchema.optional(),
    notifications: notificationSettingsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export type ProfilePatch = z.infer<typeof profilePatchSchema>;
export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

export const accountProfileViewSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  locale: z.string(),
  timezone: z.string(),
  avatarUrl: z.string().nullable().optional(),
});
export const accountPreferencesViewSchema = z.object({
  locale: z.string(),
  timezone: z.string(),
  theme: z.enum(["light", "dark", "system"]),
});
export const accountSessionViewSchema = z.object({
  id: z.uuid(),
  deviceLabel: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
});
export const accountSessionPageSchema = z.object({
  items: z.array(accountSessionViewSchema),
  nextCursor: z.string().nullable(),
});
export type AccountSessionView = z.infer<typeof accountSessionViewSchema>;
export type AccountSessionPage = z.infer<typeof accountSessionPageSchema>;
export type AccountProfileView = z.infer<typeof accountProfileViewSchema>;
export type AccountPreferencesView = z.infer<typeof accountPreferencesViewSchema>;
export const projectSettingsViewSchema = z.strictObject({
  projectId: z.string().uuid(),
  mainFileId: z.string().uuid().nullable(),
  compiler: compilerSchema,
  texliveImageVersion: z.string().min(1).max(64),
  autoCompile: z.boolean().default(false),
  timeoutSeconds: z.number().int().min(5).max(120).default(30),
});
export type ProjectSettingsView = z.infer<typeof projectSettingsViewSchema>;

export const updateProjectSettingsSchema = z
  .strictObject({
    mainFileId: z.string().uuid().nullable().optional(),
    compiler: compilerSchema.optional(),
    texliveImageVersion: z.string().min(1).max(64).optional(),
    autoCompile: z.boolean().optional(),
    timeoutSeconds: z.number().int().min(5).max(120).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one setting must be provided for update",
  });
export type UpdateProjectSettingsInput = z.infer<typeof updateProjectSettingsSchema>;

export const textStateSchema = z.strictObject({
  fileId: z.string().uuid(),
  updateBase64: z.string(),
  stateVectorBase64: z.string(),
  persistedSeq: z.number().int().nonnegative(),
});
export type TextState = z.infer<typeof textStateSchema>;

export const applyTextUpdateSchema = z.strictObject({
  updateBase64: z.string().min(1),
  baseStateVectorBase64: z.string(),
});
export type ApplyTextUpdateInput = z.infer<typeof applyTextUpdateSchema>;

export const durableAckSchema = z.strictObject({
  type: z.literal("text.durable_ack"),
  version: z.literal(1),
  fileId: z.string().uuid(),
  persistedSeq: z.number().int().nonnegative(),
  stateVectorBase64: z.string(),
});
export type DurableAck = z.infer<typeof durableAckSchema>;

export const ticketRequestSchema = z.strictObject({
  fileId: z.string().uuid(),
  action: z.enum(["read", "write"]),
});
export type TicketRequest = z.infer<typeof ticketRequestSchema>;

export const ticketViewSchema = z.strictObject({
  ticket: z.string().min(16).max(2048),
  expiresAt: z.string().datetime(),
});
export type TicketView = z.infer<typeof ticketViewSchema>;

export const eventEnvelopeSchema = z.strictObject({
  eventId: z.string().uuid(),
  version: z.literal(1),
  projectId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  type: z.enum([
    "file.created",
    "file.moved",
    "file.deleted",
    "project.settings_changed",
    "permissions.changed",
    "compile.status_changed",
    "comment.changed",
    "suggestion.changed",
    "chat.created",
  ]),
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const createCheckpointSchema = z.strictObject({
  label: z.string().max(255).optional(),
  source: z.string().max(100).default("manual"),
});
export type CreateCheckpointInput = z.infer<typeof createCheckpointSchema>;

export const compileStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancel_requested",
  "cancelled",
]);

export const diagnosticSchema = z.strictObject({
  severity: z.enum(["error", "warning", "info"]),
  filePath: z.string().min(1).max(10000).optional(),
  line: z.number().int().min(1).optional(),
  message: z.string().min(1).max(10000),
});

export const compilationRequestSchema = z.strictObject({
  compiler: compilerSchema.optional(),
  forceClean: z.boolean().default(false).optional(),
  targetRevisionId: z.string().uuid().optional(),
});
export type CompilationRequest = z.infer<typeof compilationRequestSchema>;

export const compilationViewSchema = z.strictObject({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceRevisionId: z.string().uuid(),
  status: compileStatusSchema,
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  pdfAvailable: z.boolean(),
  diagnostics: z.array(diagnosticSchema).max(2000),
});
export type CompilationView = z.infer<typeof compilationViewSchema>;

export const compilationViewPageSchema = z.strictObject({
  items: z.array(compilationViewSchema),
  nextCursor: z.string().nullable(),
});
export type CompilationViewPage = z.infer<typeof compilationViewPageSchema>;

export const artifactItemViewSchema = z.strictObject({
  name: z.string().min(1).max(10000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mime: z.string().min(1).max(10000),
  sizeBytes: z.number().int().min(0),
  url: z.string().url(),
  expiresAt: z.string().datetime(),
});
export type ArtifactItemView = z.infer<typeof artifactItemViewSchema>;

export const artifactViewSchema = z.strictObject({
  jobId: z.string().uuid(),
  sourceRevisionId: z.string().uuid(),
  items: z.array(artifactItemViewSchema).max(2000),
});
export type ArtifactView = z.infer<typeof artifactViewSchema>;

export const tagViewSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  color: z.string().min(1).max(30),
});
export type TagView = z.infer<typeof tagViewSchema>;

export const tagViewPageSchema = z.strictObject({
  items: z.array(tagViewSchema),
  nextCursor: z.string().nullable(),
});
export type TagViewPage = z.infer<typeof tagViewPageSchema>;

export const createTagSchema = z.strictObject({
  name: z.string().trim().min(1).max(50),
  color: z.string().trim().min(1).max(30),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(50).optional(),
    color: z.string().trim().min(1).max(30).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided for update",
  });
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const ownershipRequestSchema = z.strictObject({
  recipientUserId: z.string().uuid(),
});
export type OwnershipRequest = z.infer<typeof ownershipRequestSchema>;

export const ownershipViewSchema = z.strictObject({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  status: z.enum(["pending", "accepted", "rejected", "cancelled"]),
});
export type OwnershipView = z.infer<typeof ownershipViewSchema>;

export const forwardRequestSchema = z.strictObject({
  jobId: z.string().uuid(),
  fileId: z.string().uuid(),
  line: z.number().int().min(1),
  column: z.number().int().min(1),
});
export type ForwardRequest = z.infer<typeof forwardRequestSchema>;

export const synctexBoxSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type SynctexBox = z.infer<typeof synctexBoxSchema>;

export const forwardViewSchema = z.strictObject({
  page: z.number().int().min(1),
  boxes: z.array(synctexBoxSchema).max(2000),
});
export type ForwardView = z.infer<typeof forwardViewSchema>;

export const inverseRequestSchema = z.strictObject({
  jobId: z.string().uuid(),
  page: z.number().int().min(1),
  x: z.number().min(0),
  y: z.number().min(0),
});
export type InverseRequest = z.infer<typeof inverseRequestSchema>;

export const inverseViewSchema = z.strictObject({
  fileId: z.string().uuid(),
  line: z.number().int().min(1),
  column: z.number().int().min(1),
});
export type InverseView = z.infer<typeof inverseViewSchema>;

export const statisticsSchema = z.strictObject({
  approximateWords: z.number().int().min(0),
  sizeBytes: z.number().int().min(0),
  fileCount: z.number().int().min(0),
  lastCompilationAt: z.string().datetime().nullable(),
});
export type StatisticsView = z.infer<typeof statisticsSchema>;

export const searchMatchSchema = z.strictObject({
  fileId: z.string().uuid(),
  path: z.string().min(1).max(10000),
  line: z.number().int().min(1),
  text: z.string().max(10000),
});
export type SearchMatch = z.infer<typeof searchMatchSchema>;

export const searchViewSchema = z.strictObject({
  items: z.array(searchMatchSchema).max(2000),
  nextCursor: z.string().nullable(),
});
export type SearchView = z.infer<typeof searchViewSchema>;

export const replaceRequestSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
  query: z.string().min(1).max(10000),
  replacement: z.string().max(10000),
  regex: z.boolean().default(false),
  fileIds: z.array(z.string().uuid()).max(2000).optional(),
});
export type ReplaceRequest = z.infer<typeof replaceRequestSchema>;

export const replaceResultSchema = z.strictObject({
  newRevisionId: z.string().uuid(),
  replacements: z.number().int().min(0),
});
export type ReplaceResult = z.infer<typeof replaceResultSchema>;

export const visualNodeKindSchema = z.enum([
  "paragraph",
  "heading",
  "list",
  "listItem",
  "bold",
  "italic",
  "mathInline",
  "mathDisplay",
  "figure",
  "table",
  "citation",
  "reference",
  "literalFallback",
]);
export type VisualNodeKind = z.infer<typeof visualNodeKindSchema>;

export const visualPatchSchema = z.strictObject({
  fileId: z.string().min(1),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  expectedTextHash: z.string().min(1),
  replacement: z.string(),
  baseStateVectorBase64: z.string(),
});
export type VisualPatch = z.infer<typeof visualPatchSchema>;

export const visualPatchResultSchema = z.strictObject({
  success: z.boolean(),
  conflict: z.boolean(),
  reason: z.string().optional(),
  newTextHash: z.string().optional(),
});
export type VisualPatchResult = z.infer<typeof visualPatchResultSchema>;

export const templateFileSchema = z.strictObject({
  path: z.string().min(1).max(1000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().min(0),
  mime: z.string().min(1).max(128),
});
export type TemplateFile = z.infer<typeof templateFileSchema>;

export const templateViewSchema = z.strictObject({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(64),
  description: z.string().min(1).max(2000),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  mainPath: z.string().min(1).max(1000),
  files: z.array(templateFileSchema),
});
export type TemplateView = z.infer<typeof templateViewSchema>;

export const templateInstantiateSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
});
export type TemplateInstantiateInput = z.infer<typeof templateInstantiateSchema>;

export const templateDetailViewSchema = z.strictObject({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(64),
  description: z.string().min(1).max(2000),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  mainPath: z.string().min(1).max(1000),
  files: z.array(templateFileSchema),
  contents: z.array(
    z.strictObject({
      path: z.string().min(1).max(1000),
      content: z.string().max(1024 * 1024),
    }),
  ),
});
export type TemplateDetailView = z.infer<typeof templateDetailViewSchema>;

export const templateInstantiationViewSchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string(),
  templateId: z.string().min(1).max(64),
  templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  mainFileId: z.string().uuid(),
});
export type TemplateInstantiationView = z.infer<typeof templateInstantiationViewSchema>;

export const githubConnectionViewSchema = z.strictObject({
  id: z.string().uuid(),
  provider: z.literal("github"),
  scopes: z.array(z.string().min(1).max(64)),
  status: z.string().min(1).max(32),
  createdAt: z.string().min(1),
});
export type GitHubConnectionView = z.infer<typeof githubConnectionViewSchema>;

export const githubOAuthStartResponseSchema = z.strictObject({
  authorizationUrl: z.string().min(1).max(2000),
  state: z.string().min(32).max(128),
});
export type GitHubOAuthStartResponse = z.infer<typeof githubOAuthStartResponseSchema>;

export const githubOAuthCallbackSchema = z.strictObject({
  code: z.string().min(1).max(512),
  state: z.string().min(32).max(128),
});
export type GitHubOAuthCallbackInput = z.infer<typeof githubOAuthCallbackSchema>;

export const githubOAuthStatusSchema = z.strictObject({
  connected: z.boolean(),
  connectionId: z.string().uuid().optional(),
  scopes: z.array(z.string().min(1).max(64)).optional(),
});
export type GitHubOAuthStatus = z.infer<typeof githubOAuthStatusSchema>;

export const githubRepoSchema = z.strictObject({
  fullName: z.string().min(1).max(200),
  defaultBranch: z.string().min(1).max(100),
  private: z.boolean(),
});
export type GitHubRepo = z.infer<typeof githubRepoSchema>;

export const githubLinkInputSchema = z.strictObject({
  connectionId: z.string().uuid(),
  mode: z.enum(["import-new", "pair-existing"]),
  projectId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  remoteRef: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Expected owner/repo"),
  branch: z.string().min(1).max(100).optional(),
  expectedRemoteSha: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
});
export type GitHubLinkInput = z.infer<typeof githubLinkInputSchema>;

export const githubManifestDiffSchema = z.strictObject({
  path: z.string().min(1).max(1000),
  side: z.enum(["only-local", "only-remote", "differing"]),
  localKind: z.enum(["file", "folder"]).nullable(),
  remoteKind: z.enum(["file", "folder"]).nullable(),
});
export type GitHubManifestDiff = z.infer<typeof githubManifestDiffSchema>;

export const githubLinkResultSchema = z.strictObject({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
  mode: z.enum(["import-new", "pair-existing"]),
  remoteRef: z.string().min(1).max(200),
  branch: z.string().min(1).max(100),
  remoteSha: z.string().regex(/^[a-f0-9]{40}$/),
  comparison: z.array(githubManifestDiffSchema),
  conflict: z.boolean(),
});
export type GitHubLinkResult = z.infer<typeof githubLinkResultSchema>;

export * from "./storage.js";
export * from "./executor.js";
export * from "./provider.js";
