# Integrations, Git and Assistance Contract

## Typed Adapter Boundary

```ts
type ProviderCapabilities = { list: boolean; pull: boolean; push: boolean; individualReferenceImport: boolean };
type ProviderError = { code: 'PROVIDER_UNAVAILABLE' | 'CREDENTIALS_MISSING' | 'TOKEN_EXPIRED' |
  'CAPABILITY_UNSUPPORTED' | 'REMOTE_CONFLICT' | 'RATE_LIMITED'; retryable: boolean; detail: string };
type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: ProviderError };
type Resource = { id: string; name: string; kind: 'repository' | 'library' | 'folder'; remoteRevision: string };
type SyncInput = { projectId: string; sourceRevisionId: string; expectedRemoteRevision: string; resourceId: string };
type SyncResult = { status: 'synced' | 'conflict'; remoteRevision: string; localRevisionId: string;
  conflicts: Array<{ path: string; kind: 'text' | 'binary' | 'tree' }> };
interface ProviderAdapter {
  connect(authCode: string, state: string): Promise<ProviderResult<{ connectionId: string; capabilities: ProviderCapabilities }>>;
  disconnect(connectionId: string): Promise<ProviderResult<void>>;
  listResources(connectionId: string, cursor?: string): Promise<ProviderResult<{ items: Resource[]; nextCursor: string | null }>>;
  pull(connectionId: string, input: SyncInput): Promise<ProviderResult<SyncResult>>;
  push(connectionId: string, input: SyncInput): Promise<ProviderResult<SyncResult>>;
  getStatus(connectionId: string, projectId: string): Promise<ProviderResult<SyncResult>>;
}
```

Connections belong to users; linking to a project separately requires current project rights. OAuth uses state/replay protection, PKCE where supported, minimal scopes, encrypted server-held credentials and refresh/revocation. Provider-specific endpoints, scopes and permitted operations are research outputs, not assumed access. UI states: disconnected/connected/sync_pending/syncing/conflict/error/synced; missing credentials/provider capability remain explicitly blocked.

## Synchronization Rules

Manual explicit sync first. Freeze/checkpoint before sync; compare local revision and common remote base. Pull validates remote paths/sizes and resolves keep-local/keep-remote/manual merge explicitly; binary conflicts always need a choice. Apply authorized canonical Yjs mutations, not direct DB snapshot replacement, so live clients receive events. Push uses frozen source and expectedRemoteSHA; remote advancement yields conflict, never automatic force push. Audit actor/base/source/result and preserve comments or report detached anchors.

GitHub link distinguishes import as new project versus pair current project and compares initial manifests. Ignore .git, output artifacts and secrets explicitly. Test revocation, remote force push, rename, binary and two-editor changes.

## Git HTTP

Git bridge implements smart HTTP upload-pack/receive-pack with scoped revocable tokens, real clone/fetch/push, revision→commit mapping, expected base and new content revision on import. Research the actual engine/protocol/license before implementation. Fixed argv and safe repository paths; ZIP export is a separate capability. CLI tests prove Unicode/binary and non-fast-forward behavior.

## Bibliography and Remote Files

Index citationKey/title/author/year/journal/DOI without changing .bib on open. Detect bibliography/addbibresource commands and selected library. Linked external .bib is read-only; individual entries become editable only if provider capability permits. Refresh offers diff and protects manual changes. No scraping or bypassing API terms.

Zotero/Dropbox/GitHub require credentialed staging evidence. Mendeley/Papers remain contingent on current legitimate API/plan access. Dropbox manual export precedes optional bidirectional conflict-aware sync. URL import accepts only explicit permitted sources with DNS revalidation, private-range and redirect rejection, timeout/size/type bounds and server network enforcement.

## Optional Writing Assistance

```ts
interface WritingAssistantProvider {
  suggest(input: { userId: string; projectId: string; consentVersion: string;
    selectedText: string; locale: string }, signal: AbortSignal): Promise<ProviderResult<{ suggestions: string[] }>>;
}
```

Static help/local spell checking precedes third-party assistance. Consent is per user/project; send only the displayed selected fragment; apply configurable quota, disconnect and deletion behavior. Log consent/configuration rather than manuscript. Provider failure never prevents editing. No claim to a proprietary writing integration without legitimate access.

## Valid and Invalid Examples

Valid: frozen local revision L7 and expected remote SHA R3 push; remote still R3, then new SHA R4 and audit are returned. A permitted reference import adds one local editable entry.

Invalid: remote advances to R4 before push based on R3 → REMOTE_CONFLICT with no overwrite. Missing credentials → CREDENTIALS_MISSING, never mocked synced state. URL redirects to 169.254.169.254/private range → rejected. Assistance without recorded consent → forbidden before any network request.
