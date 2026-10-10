# Technical Specification

## Contract Sources

The documents in [Contracts](../contracts/README.md) define interface boundaries. `docs/contracts/openapi.json` is the planned HTTP schema source; `packages/contracts/src/` will implement matching runtime Zod schemas in S01-T05. Generate the runtime OpenAPI artifact from those schemas and check semantic agreement; maintain one authoritative schema per interface rather than hand-editing competing copies.

| Boundary | Contract |
|---|---|
| Relational entities / invariants | [Data Model](../contracts/data-model.md) |
| HTTP routes, errors, authentication | [HTTP API](../contracts/http-api.md) and OpenAPI |
| Yjs rooms, tickets, ACK and invalidation | [Collaboration](../contracts/collaboration.md) |
| S3 adapter / immutable manifests | [Storage and Revisions](../contracts/storage-and-revisions.md) |
| Compile jobs / executor / artifacts | [Compilation](../contracts/compilation.md) |
| History / suggestions / visual source patches | [Editing and Review](../contracts/editing-and-review.md) |
| External adapters / Git / assistance | [Integrations](../contracts/integrations.md) |
| Commands and environment | [Development Tooling](../contracts/development-tooling.md) |

## Frontend Routes

`/`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/projects`, `/project/:projectId`, `/templates`, `/templates/:templateId`, `/settings/profile`, `/settings/editor`, `/settings/integrations`, `/settings/security`, `/invitations/:token`, `/share/:token`, `/admin`. Reset flows include `/reset-password`. Query filters select owned/shared/recent/archived/trashed/tagged projects. An administrator is explicitly authorized server-side; owning a project does not confer global admin status.

## Editor Layout and Components

The top bar shows project, menu, share, collaborators, history and compile controls. Resizable panels contain files/search/review/chat/history/help, code or visual view, and PDF. Bottom status shows connection, actual save state, engine, diagnostics and build version. Small screens switch panels; layout supports split, editor-only, PDF-only and separate PDF tab.

Components: `ProjectTable`, `ProjectFilters`, `ProjectCreateDialog`, `TagPicker`, `EditorLayout`, `ProjectTopbar`, `ResizablePane`, `ActivitySidebar`, `FileTree`, `FileTreeItem`, `FileUploader`, `FileContextMenu`, `LatexCodeEditor`, `EditorTabs`, `EditorToolbar`, `SyntaxDiagnostics`, `PdfViewer`, `PdfToolbar`, `CompilationBanner`, `LogPanel`, `PresenceAvatars`, `RemoteCursors`, `ShareDialog`, `PermissionBadge`, `CommentThread`, `ReviewSidebar`, `SuggestionCard`, `DiffView`, `HistoryTimeline`, `VersionLabelDialog`, `VersionCompare`, `RestoreDialog`, `IntegrationSettings`, `SyncStatus`, `ConflictDialog`, `AuthForms`, `SessionList`, `PreferencesForm`.

Every feature defines loading/empty/error/forbidden/reconnecting states. Compile does not block editing. Logs navigate to file/line. Show the source revision of a displayed PDF and label older output. Lazy-load PDF.js, code and visual engines; virtualize large trees; cancel stale searches; start with a configurable 200 ms search debounce. React does not rerender the entire editor on every Yjs keystroke. Persist UI preferences separately from canonical CRDT text.

## Technical Invariants

- UUID IDs and UTC ISO timestamps; relational timestamps use `timestamptz`.
- File tree parentage uses IDs within one project; derived paths cannot traverse, collide or cycle.
- Exactly one canonical `Y.Doc` / `Y.Text('content')` per text file; binaries are atomic object-backed nodes.
- Acknowledged saves survive restart; a socket receipt or IndexedDB write does not indicate server persistence.
- Compile/sync/export read a frozen revision and hash manifest; live changes never mutate that revision.
- Restore creates a new revision, preserves present authorization, and checks `expectedRevision`.
- Reviewers propose changes; only authorized editors/owners can apply them to canonical text.
- Visual mode is a projection; unknown macros remain literal and opening/closing it is byte-preserving.
- Private object access checks permissions before issuing a short signed URL.

## Ready Gate

A task becomes Ready only after dependencies complete, its producer/consumer schema is available, its estimate fits 8 h, a test fixture and expected failures are defined, and required environment access exists. Proposed provider/sandbox designs require research spikes before their implementation task becomes Ready. Planned contracts and tests are not evidence of runtime support.
