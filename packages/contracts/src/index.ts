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
  deletedAt: z.string().datetime().nullable().optional(),
});
export type ProjectNodeView = z.infer<typeof projectNodeViewSchema>;

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
  filter: z.enum(["owned", "shared", "recent"]).default("owned"),
  order: z.enum(["updatedAt", "owner"]).default("updatedAt"),
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
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export * from "./storage.js";
