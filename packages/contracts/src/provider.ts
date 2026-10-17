import { z } from "zod";

export const providerCapabilitiesSchema = z.strictObject({
  list: z.boolean(),
  pull: z.boolean(),
  push: z.boolean(),
  individualReferenceImport: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

export const providerErrorCodeSchema = z.enum([
  "PROVIDER_UNAVAILABLE",
  "CREDENTIALS_MISSING",
  "TOKEN_EXPIRED",
  "CAPABILITY_UNSUPPORTED",
  "REMOTE_CONFLICT",
  "RATE_LIMITED",
]);
export type ProviderErrorCode = z.infer<typeof providerErrorCodeSchema>;

export const providerErrorSchema = z.strictObject({
  code: providerErrorCodeSchema,
  retryable: z.boolean(),
  detail: z.string(),
});
export type ProviderError = z.infer<typeof providerErrorSchema>;

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProviderError };

export const resourceKindSchema = z.enum(["repository", "library", "folder"]);
export type ResourceKind = z.infer<typeof resourceKindSchema>;

export const resourceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: resourceKindSchema,
  remoteRevision: z.string().min(1),
});
export type Resource = z.infer<typeof resourceSchema>;

export const syncInputSchema = z.strictObject({
  projectId: z.string().uuid(),
  sourceRevisionId: z.string().min(1),
  expectedRemoteRevision: z.string().min(1),
  resourceId: z.string().min(1),
});
export type SyncInput = z.infer<typeof syncInputSchema>;

export const syncConflictKindSchema = z.enum(["text", "binary", "tree"]);
export type SyncConflictKind = z.infer<typeof syncConflictKindSchema>;

export const syncConflictSchema = z.strictObject({
  path: z.string().min(1),
  kind: syncConflictKindSchema,
});
export type SyncConflict = z.infer<typeof syncConflictSchema>;

export const syncResultStatusSchema = z.enum(["synced", "conflict"]);
export type SyncResultStatus = z.infer<typeof syncResultStatusSchema>;

export const syncResultSchema = z.strictObject({
  status: syncResultStatusSchema,
  remoteRevision: z.string().min(1),
  localRevisionId: z.string().min(1),
  conflicts: z.array(syncConflictSchema),
});
export type SyncResult = z.infer<typeof syncResultSchema>;

export interface ProviderAdapter {
  connect(authCode: string, state: string): Promise<ProviderResult<{ connectionId: string; capabilities: ProviderCapabilities }>>;
  disconnect(connectionId: string): Promise<ProviderResult<void>>;
  listResources(connectionId: string, cursor?: string): Promise<ProviderResult<{ items: Resource[]; nextCursor: string | null }>>;
  pull(connectionId: string, input: SyncInput): Promise<ProviderResult<SyncResult>>;
  push(connectionId: string, input: SyncInput): Promise<ProviderResult<SyncResult>>;
  getStatus(connectionId: string, projectId: string): Promise<ProviderResult<SyncResult>>;
}

export const connectionStatusSchema = z.enum([
  "disconnected",
  "connected",
  "sync_pending",
  "syncing",
  "conflict",
  "error",
  "synced",
]);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const externalConnectionViewSchema = z.strictObject({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  provider: z.string().min(1),
  scopes: z.array(z.string()),
  status: z.string().min(1),
  createdAt: z.string(),
});
export type ExternalConnectionView = z.infer<typeof externalConnectionViewSchema>;

export const connectProviderRequestSchema = z.strictObject({
  code: z.string().min(1).optional(),
  state: z.string().optional(),
  apiKey: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ConnectProviderRequest = z.infer<typeof connectProviderRequestSchema>;

export const connectProviderResponseSchema = z.strictObject({
  connection: externalConnectionViewSchema,
  capabilities: providerCapabilitiesSchema,
});
export type ConnectProviderResponse = z.infer<typeof connectProviderResponseSchema>;

export const refreshConnectionResponseSchema = z.strictObject({
  connection: externalConnectionViewSchema,
  refreshedAt: z.string(),
});
export type RefreshConnectionResponse = z.infer<typeof refreshConnectionResponseSchema>;

export const projectIntegrationViewSchema = z.strictObject({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
  provider: z.string().min(1),
  remoteRef: z.string().min(1),
  branch: z.string().nullable().optional(),
  lastSyncedRevision: z.string().nullable().optional(),
  syncCursor: z.string().nullable().optional(),
});
export type ProjectIntegrationView = z.infer<typeof projectIntegrationViewSchema>;

export const linkProjectIntegrationRequestSchema = z.strictObject({
  connectionId: z.string().uuid(),
  remoteRef: z.string().min(1),
  branch: z.string().optional(),
});
export type LinkProjectIntegrationRequest = z.infer<typeof linkProjectIntegrationRequestSchema>;

export const importReferenceEntrySchema = z.strictObject({
  key: z.string().min(1),
  rawSource: z.string().min(1),
  type: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  year: z.string().optional(),
  doi: z.string().optional(),
  journal: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ImportReferenceEntry = z.infer<typeof importReferenceEntrySchema>;

export const importReferencesRequestSchema = z.strictObject({
  connectionId: z.string().uuid().optional(),
  provider: z.string().min(1),
  targetFileId: z.string().uuid().optional(),
  targetFilePath: z.string().optional(),
  entries: z.array(importReferenceEntrySchema).min(1),
  normalize: z.boolean().optional().default(false),
});
export type ImportReferencesRequest = z.infer<typeof importReferencesRequestSchema>;

export const importReferencesResponseSchema = z.strictObject({
  success: z.boolean(),
  importedCount: z.number().int().nonnegative(),
  keys: z.array(z.string()),
  targetFileId: z.string().uuid().optional(),
  duplicates: z.array(z.string()).optional(),
  newContent: z.string().optional(),
});
export type ImportReferencesResponse = z.infer<typeof importReferencesResponseSchema>;

