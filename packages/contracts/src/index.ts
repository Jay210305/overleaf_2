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

export const createCheckpointSchema = z.strictObject({
  label: z.string().max(255).optional(),
  source: z.string().max(100).default("manual"),
});
export type CreateCheckpointInput = z.infer<typeof createCheckpointSchema>;

export * from "./storage.js";
