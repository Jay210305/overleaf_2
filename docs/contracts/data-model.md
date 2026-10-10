# Data Model Contract

## Encoding and Identity

UUID identifiers; UTC timestamptz; UTF-8 source bytes are preserved without normalization. Normalize email under one documented registration policy; normalize node names separately. JSON/bytea values are bounded and validated by the producing contract. Fields ending in ? below are nullable. A missing nullable marker does not allow silently omitting a field from a migration.

## Entities, Fields and Constraints

| Table | Minimum fields and SQL types | Constraints / indexes |
|---|---|---|
| `users` | `id`: uuid; `email_normalized`: text (enum/hash constraints where specified); `password_hash?`: text (enum/hash constraints where specified); `display_name`: text (enum/hash constraints where specified); `avatar_key?`: text (enum/hash constraints where specified); `email_verified_at?`: timestamptz UTC; `created_at`: timestamptz UTC; `disabled_at?`: timestamptz UTC | Unique normalized email; Argon2id hash; disabled user has no active access |
| `user_preferences` | `user_id`: uuid; `locale`: text (enum/hash constraints where specified); `timezone`: text (enum/hash constraints where specified); `theme`: text (enum/hash constraints where specified); `editor_settings_json`: jsonb (validated schema); `notification_settings_json`: jsonb (validated schema) | One preference row per user |
| `sessions` | `id`: uuid; `user_id`: uuid; `token_hash`: text (enum/hash constraints where specified); `expires_at`: timestamptz UTC; `last_seen_at`: timestamptz UTC; `revoked_at`: timestamptz UTC; `device_label`: text (enum/hash constraints where specified) | Hashed token, indexed user/expiry, revocable; never store raw session token |
| `auth_identities` | `id`: uuid; `user_id`: uuid; `provider`: text (enum/hash constraints where specified); `provider_subject`: text (enum/hash constraints where specified) | Unique provider + provider_subject; safe account linking |
| `verification_tokens` | `id`: uuid; `user_id`: uuid; `purpose`: text (enum/hash constraints where specified); `token_hash`: text (enum/hash constraints where specified); `expires_at`: timestamptz UTC; `used_at`: timestamptz UTC | Hashed single-use purpose-scoped token; expiry and purge |
| `projects` | `id`: uuid; `owner_id`: uuid; `title`: text (enum/hash constraints where specified); `description`: text (enum/hash constraints where specified); `main_file_id?`: uuid; `compiler`: text (enum/hash constraints where specified); `texlive_image_version`: text (enum/hash constraints where specified); `status`: text (enum/hash constraints where specified); `current_revision`: bigint >=0; `created_at`: timestamptz UTC; `updated_at`: timestamptz UTC | Owner FK; same-project active main file; monotonic current_revision; owner/status/updated indexes |
| `project_members` | `project_id`: uuid; `user_id`: uuid; `role`: text (enum/hash constraints where specified); `joined_at`: timestamptz UTC; `revoked_at?`: timestamptz UTC | Unique active project/user membership; role enum; revocation effective immediately |
| `project_invitations` | `id`: uuid; `project_id`: uuid; `email_normalized`: text (enum/hash constraints where specified); `role`: text (enum/hash constraints where specified); `token_hash`: text (enum/hash constraints where specified); `expires_at`: timestamptz UTC; `accepted_at`: timestamptz UTC; `invited_by`: text (enum/hash constraints where specified) | Hashed expiring invite; unique pending invite; inviter authorization |
| `share_links` | `id`: uuid; `project_id`: uuid; `token_hash`: text (enum/hash constraints where specified); `role`: text (enum/hash constraints where specified); `expires_at?`: timestamptz UTC; `max_uses?`: bigint >=0; `use_count`: bigint >=0; `revoked_at`: timestamptz UTC | Hashed random token lookup; restricted role; bounded uses; revocable |
| `project_nodes` | `id`: uuid; `project_id`: uuid; `parent_id?`: uuid; `name`: text (enum/hash constraints where specified); `kind=FILE/FOLDER`: text (enum/hash constraints where specified); `mime`: text (enum/hash constraints where specified); `size_bytes`: bytea; `content_kind=TEXT/BINARY`: text (enum/hash constraints where specified); `blob_key?`: text (enum/hash constraints where specified); `deleted_at?`: timestamptz UTC | Same-project parent FK; unique active sibling AND null-parent root names; no cycle/traversal |
| `project_tags` | `id`: uuid; `user_id`: uuid; `name`: text (enum/hash constraints where specified); `color`: text (enum/hash constraints where specified) | Unique user/name; validated color |
| `project_tag_links` | `project_id`: uuid; `tag_id`: uuid | Composite project/tag PK; user authorization |
| `text_documents` | `file_id`: uuid; `project_id`: uuid; `latest_snapshot_id?`: uuid; `last_persisted_seq`: bigint >=0; `updated_at`: timestamptz UTC | One per TEXT node; last_persisted_seq monotonic |
| `crdt_updates` | `id`: uuid; `file_id`: uuid; `seq`: bigint >=0; `actor_user_id?`: uuid; `payload_bytes`: bytea; `created_at`: timestamptz UTC | Unique file/seq; actor optional; append only until verified snapshot |
| `crdt_snapshots` | `id`: uuid; `file_id`: uuid; `upto_seq`: bigint >=0; `state_bytes`: bytea; `blob_key`: text (enum/hash constraints where specified); `content_sha256`: text (enum/hash constraints where specified); `created_at`: timestamptz UTC | Indexed file/upto_seq; exactly one of state_bytes/blob_key; verify SHA-256 |
| `project_revisions` | `id`: uuid; `project_id`: uuid; `revision_no`: bigint >=0; `manifest_key`: text (enum/hash constraints where specified); `manifest_hash`: text (enum/hash constraints where specified); `author_id?`: uuid; `source`: text (enum/hash constraints where specified); `created_at`: timestamptz UTC; `label?`: text (enum/hash constraints where specified) | Unique project/revision_no; immutable manifest and hash |
| `revision_items` | `revision_id`: uuid; `node_id`: uuid; `path`: text (enum/hash constraints where specified); `blob_key`: text (enum/hash constraints where specified); `sha256`: text (enum/hash constraints where specified); `deleted`: boolean | Unique revision/path; node ID and exact blob hash; optional if equivalent full manifest storage chosen |
| `comments` | `id`: uuid; `project_id`: uuid; `file_id`: uuid; `created_by`: text (enum/hash constraints where specified); `anchor_start_json`: jsonb (validated schema); `anchor_end_json`: jsonb (validated schema); `body`: text (enum/hash constraints where specified); `status`: text (enum/hash constraints where specified); `created_at`: timestamptz UTC | File/project consistency; validated relative anchors; bounded sanitized body and status |
| `comment_replies` | `id`: uuid; `comment_id`: uuid; `author_id`: uuid; `body`: text (enum/hash constraints where specified); `created_at`: timestamptz UTC; `deleted_at?`: timestamptz UTC | Indexed comment/time; author rights; logical removal policy |
| `suggestions` | `id`: uuid; `project_id`: uuid; `file_id`: uuid; `author_id`: uuid; `kind`: text (enum/hash constraints where specified); `base_revision`: text (enum/hash constraints where specified); `anchor_json`: jsonb (validated schema); `old_text_hash`: text (enum/hash constraints where specified); `new_text`: text (enum/hash constraints where specified); `status`: text (enum/hash constraints where specified); `resolved_by?`: text (enum/hash constraints where specified) | File/status index; base revision/hash/anchors; transactional resolution |
| `chat_messages` | `id`: uuid; `project_id`: uuid; `author_id`: uuid; `body`: text (enum/hash constraints where specified); `created_at`: timestamptz UTC; `deleted_at?`: timestamptz UTC | Indexed project/created time; bounded sanitized body |
| `compile_jobs` | `id`: uuid; `project_id`: uuid; `requested_by`: text (enum/hash constraints where specified); `source_revision_id`: uuid; `engine`: text (enum/hash constraints where specified); `options_hash`: text (enum/hash constraints where specified); `status`: text (enum/hash constraints where specified); `queue_id`: uuid; `started_at?`: timestamptz UTC; `finished_at?`: timestamptz UTC; `error_code?`: text (enum/hash constraints where specified); `artifact_set_id?`: uuid | Project/time and status/time indexes; immutable source_revision_id; idempotent queue association |
| `artifact_sets` | `id`: uuid; `compile_job_id`: uuid; `pdf_key?`: text (enum/hash constraints where specified); `log_key?`: text (enum/hash constraints where specified); `synctex_key?`: text (enum/hash constraints where specified); `aux_manifest_key?`: text (enum/hash constraints where specified); `source_hash`: text (enum/hash constraints where specified); `created_at`: timestamptz UTC; `expires_at?`: timestamptz UTC | Unique compile_job_id; private bounded objects; source_hash immutable |
| `external_connections` | `id`: uuid; `user_id`: uuid; `provider`: text (enum/hash constraints where specified); `encrypted_credential_ref`: text (enum/hash constraints where specified); `scopes_json`: jsonb (validated schema); `status`: text (enum/hash constraints where specified); `created_at`: timestamptz UTC | User owns connection; encrypted server-side credential; capability/scopes/status |
| `project_integrations` | `id`: uuid; `project_id`: uuid; `connection_id`: uuid; `provider`: text (enum/hash constraints where specified); `remote_ref`: text (enum/hash constraints where specified); `branch?`: text (enum/hash constraints where specified); `last_synced_revision?`: text (enum/hash constraints where specified); `sync_cursor?`: text (enum/hash constraints where specified) | Authorized project association; provider/project/remote uniqueness; explicit branch/base/cursor |
| `templates` | `id`: uuid; `owner_id?`: uuid; `title`: text (enum/hash constraints where specified); `category`: text (enum/hash constraints where specified); `description`: text (enum/hash constraints where specified); `source_manifest_key`: text (enum/hash constraints where specified); `published_at?`: timestamptz UTC; `version`: text (enum/hash constraints where specified) | Versioned immutable source; permitted ownership/publishing and catalogue index |
| `audit_events` | `id`: uuid; `actor_id?`: uuid; `project_id?`: uuid; `action`: text (enum/hash constraints where specified); `target_type`: text (enum/hash constraints where specified); `target_id`: uuid; `metadata_redacted`: jsonb (validated schema); `occurred_at`: timestamptz UTC; `request_id`: uuid | Redacted metadata only; request ID and actor; bounded retention |
| `notifications` | `id`: uuid; `user_id`: uuid; `type`: text (enum/hash constraints where specified); `payload_json`: jsonb (validated schema); `read_at?`: timestamptz UTC; `created_at`: timestamptz UTC | User/time index; authorized payload; idempotent source event |
| `usage_quotas` | `subject_type`: text (enum/hash constraints where specified); `subject_id`: uuid; `metric`: text (enum/hash constraints where specified); `max_value`: bigint >=0; `window`: text (enum/hash constraints where specified); `effective_at`: timestamptz UTC | Unique subject/metric/window; positive finite max; explicit effective date |
| `feature_flags` | `key`: text (enum/hash constraints where specified); `enabled`: boolean; `scope`: text (enum/hash constraints where specified); `configuration_json`: jsonb (validated schema) | Unique key; enabled/scope/config validated |

Enum contracts: roles OWNER/EDITOR/REVIEWER/VIEWER; node kind FILE/FOLDER and content kind TEXT/BINARY; compiler pdflatex/xelatex/lualatex/latex; project state active/archived/trashed; suggestion pending/accepted/rejected/conflict; comment open/resolved/detached; compile states in compilation contract. Numeric fields are nonnegative with scoped positive sequence/revision counters. Compiler limits/quotas cannot be arbitrary JSON accepted from clients.

## Repository Boundary

```ts
type UUID = string; // runtime-validated UUID
interface TransactionContext {
  query<Row>(sql: string, parameters: readonly unknown[]):
    Promise<{ rows: Row[]; rowCount: number }>;
}
type PersistenceError = {
  code: 'CONSTRAINT_VIOLATION' | 'TRANSACTION_CONFLICT' | 'DATABASE_UNAVAILABLE';
  retryable: boolean;
};
```

SQL strings are reviewed application statements; untrusted values go only in parameter slots. The transaction callback must not publish an external success/ACK before commit. Constraint conflicts map to typed conflict/validation outcomes, outages to unavailable, and raw database messages never reach the browser. S01-T03 defines these runtime types in packages/db/src/client.ts.

`DatabaseClient.transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>` commits all work or rolls back on a typed exception. TransactionContext exposes query execution for reviewed parameterized SQL and never travels to browser DTOs.

`ProjectRepository.list(actorId: UUID, input: {cursor?: string; limit: number; filter: 'owned'|'shared'|'recent'; order: 'updatedAt'|'owner'}): Promise<{items: ProjectView[]; nextCursor: string|null}>` applies membership before pagination and sorts by the selected field plus ID tie-breaker. ProjectView is the HTTP schema, not a database entity.

## Transaction Invariants

1. Parent and active main .tex file belong to the same project. Tree uses ID hierarchy, not user-provided path strings.
2. Rename/move/delete takes version guard and transaction lock; active sibling/root uniqueness survives concurrent creation.
3. TEXT canonical state is Yjs plus durable updates/snapshots, with no incompatible project_nodes text column. BINARY source is private object hash plus metadata.
4. Project revision is immutable across every source file; structural changes/checkpoints advance monotonic revision_no. Restore creates a new revision.
5. Content restore never restores revoked members, current owner, or sessions. Sole owner must transfer or delete before leaving.
6. compile_job source_revision_id and artifact source hash are immutable; older output is visibly old.
7. Saved means committed coverage in persistence protocol; snapshots delete updates only after verified hash and upto_seq.
8. Invitations/share/session tokens persist hashes only. Revocation invalidates live collaboration access and short-lived tickets.
9. Suggestions stay independent until acceptance; relative comment/suggestion anchors have contextual hashes and detached fallback.
10. Audit/outbox writes share the mutation transaction; GC rechecks references across DB and object manifests.

## Schema Evolution

S01-T01/T04 define typed Drizzle models; S01-T02/T09 split reviewable SQL migrations. Fields such as role/status are constrained, FK pairs enforce cross-project consistency, and DB tests cover null-root uniqueness and race rollback. Use deleted_at only on scoped aggregates with authorized permanent deletion/retention; eventual physical object cleanup must be tracked. Optional revision_items may be omitted only with an ADR showing equivalent manifest integrity/query behavior.

## Valid and Invalid Examples

Valid: owner creates a .tex node at root, its text_documents record and committed CRDT state, and a new immutable project revision in one authorized mutation sequence.

Invalid: foreign-project parent/main_file_id, duplicate active root name, invalid role or stale rename fails FK/unique/policy/version validation; transaction leaves previous tree and revision intact. Restoring an old content revision cannot reactivate a revoked membership.
