# Implementation Task Index

**Version:** 1.0.0 | **Date:** 2026-10-09 | **Maintainers:** Julio and Project Co-owner
**Status:** All product tasks are planned, not implemented.

Start with [Discovery](../docs/planning/00-discovery.md) and the [Roadmap](../docs/planning/04-implementation-roadmap.md). Each task contains its own purpose, scoped acceptance, prerequisites, producer/consumer summary, <=2 h steps, planned file paths, verification and Done checklist. Supporting contract links contain the authoritative boundary details.

## Task Index

| ID | File | Owner | Hours | Status |
|---|---|---|---|---|
| S00-T01 | [Inspect repository and preserve contributor changes](sprint-00-bootstrap/S00-T01-inspect-repository-and-preserve-contributor-changes.md) | Julio (proposed) | 4 | done |
| S00-T11 | [Check editor collaboration dependency compatibility](sprint-00-bootstrap/S00-T11-check-editor-collaboration-dependency-compatibility.md) | Julio (proposed) | 4 | done |
| S00-T02 | [Write permanent agent execution rules](sprint-00-bootstrap/S00-T02-write-permanent-agent-execution-rules.md) | Julio (proposed) | 4 | done |
| S00-T03 | [Create typed pnpm monorepo](sprint-00-bootstrap/S00-T03-create-typed-pnpm-monorepo.md) | Julio (proposed) | 6 | done |
| S00-T04 | [Create browser shell and route providers](sprint-00-bootstrap/S00-T04-create-browser-shell-and-route-providers.md) | Julio (proposed) | 6 | done |
| S00-T05 | [Create API health and error boundary](sprint-00-bootstrap/S00-T05-create-api-health-and-error-boundary.md) | Julio (proposed) | 6 | done |
| S00-T06 | [Configure code quality and CI](sprint-00-bootstrap/S00-T06-configure-code-quality-and-ci.md) | Julio (proposed) | 8 | done |
| S00-T07 | [Create local services and validated configuration](sprint-00-bootstrap/S00-T07-create-local-services-and-validated-configuration.md) | Julio (proposed) | 8 | done |
| S00-T12 | [Deliver browser to API walking skeleton](sprint-00-bootstrap/S00-T12-deliver-browser-to-api-walking-skeleton.md) | Julio (proposed) | 6 | done |
| S00-T08 | [Record initial architecture decisions](sprint-00-bootstrap/S00-T08-record-initial-architecture-decisions.md) | Julio (proposed) | 4 | done |
| S00-T09 | [Initialize feature and evidence inventory](sprint-00-bootstrap/S00-T09-initialize-feature-and-evidence-inventory.md) | Julio (proposed) | 4 | done |
| S00-T10 | [Document clean development startup](sprint-00-bootstrap/S00-T10-document-clean-development-startup.md) | Julio (proposed) | 6 | done |
| S01-T01 | [Define core Drizzle entities](sprint-01-data-contracts/S01-T01-define-core-drizzle-entities.md) | Project Co-owner (proposed) | 8 | done |
| S01-T02 | [Create SQL migrations and constraints](sprint-01-data-contracts/S01-T02-create-sql-migrations-and-constraints.md) | Project Co-owner (proposed) | 8 | done |
| S01-T03 | [Create transaction and repository primitives](sprint-01-data-contracts/S01-T03-create-transaction-and-repository-primitives.md) | Project Co-owner (proposed) | 6 | done |
| S01-T04 | [Define future collaboration and integration tables](sprint-01-data-contracts/S01-T04-define-future-collaboration-and-integration-tables.md) | Project Co-owner (proposed) | 8 | done |
| S01-T09 | [Complete support entity migration slices](sprint-01-data-contracts/S01-T09-complete-support-entity-migration-slices.md) | Project Co-owner (proposed) | 8 | done |
| S01-T05 | [Implement Zod DTOs and OpenAPI generation](sprint-01-data-contracts/S01-T05-implement-zod-dtos-and-openapi-generation.md) | Project Co-owner (proposed) | 8 | done |
| S01-T06 | [Create isolated seeds and fixtures](sprint-01-data-contracts/S01-T06-create-isolated-seeds-and-fixtures.md) | Project Co-owner (proposed) | 6 | done |
| S01-T07 | [Test constraints rollback and naming races](sprint-01-data-contracts/S01-T07-test-constraints-rollback-and-naming-races.md) | Project Co-owner (proposed) | 6 | done |
| S01-T08 | [Create private S3 adapter](sprint-01-data-contracts/S01-T08-create-private-s3-adapter.md) | Project Co-owner (proposed) | 8 | done |
| S01-T10 | [Deliver persisted development sample vertical slice](sprint-01-data-contracts/S01-T10-deliver-persisted-development-sample-vertical-slice.md) | Project Co-owner (proposed) | 6 | done |
| S02-T01 | [Implement registration and verification](sprint-02-identity-permissions/S02-T01-implement-registration-and-verification.md) | Julio (proposed) | 8 | done |
| S02-T02 | [Implement cookie sessions and logout](sprint-02-identity-permissions/S02-T02-implement-cookie-sessions-and-logout.md) | Julio (proposed) | 8 | done |
| S02-T03 | [Implement password recovery](sprint-02-identity-permissions/S02-T03-implement-password-recovery.md) | Julio (proposed) | 8 | done |
| S02-T04 | [Implement session and project policy guards](sprint-02-identity-permissions/S02-T04-implement-session-and-project-policy-guards.md) | Julio (proposed) | 8 | done |
| S02-T05 | [Create accessible authentication forms](sprint-02-identity-permissions/S02-T05-create-accessible-authentication-forms.md) | Julio (proposed) | 8 | done |
| S02-T06 | [Add authentication rate limits and redaction](sprint-02-identity-permissions/S02-T06-add-authentication-rate-limits-and-redaction.md) | Julio (proposed) | 6 | done |
| S02-T09 | [Create redacted audit event writer](sprint-02-identity-permissions/S02-T09-create-redacted-audit-event-writer.md) | Julio (proposed) | 6 | done |
| S02-T07 | [Implement profile preferences and session management](sprint-02-identity-permissions/S02-T07-implement-profile-preferences-and-session-management.md) | Julio (proposed) | 8 | done |
| S02-T10 | [Implement authenticated password change](sprint-02-identity-permissions/S02-T10-implement-authenticated-password-change.md) | Julio (proposed) | 6 | done |
| S02-T11 | [Implement private avatar upload lifecycle](sprint-02-identity-permissions/S02-T11-implement-private-avatar-upload-lifecycle.md) | Julio (proposed) | 6 | done |
| S02-T08 | [Verify tenancy revocation suspension and CSRF](sprint-02-identity-permissions/S02-T08-verify-tenancy-revocation-suspension-and-csrf.md) | Julio (proposed) | 6 | done |
| S03-T01 | [Implement project CRUD and pagination](sprint-03-projects-files/S03-T01-implement-project-crud-and-pagination.md) | Project Co-owner (proposed) | 8 | done |
| S03-T02 | [Create duplicate and rename project sources](sprint-03-projects-files/S03-T02-create-duplicate-and-rename-project-sources.md) | Project Co-owner (proposed) | 8 | done |
| S03-T03 | [Create API-backed dashboard](sprint-03-projects-files/S03-T03-create-api-backed-dashboard.md) | Project Co-owner (proposed) | 8 | done |
| S03-T04 | [Implement ID-based file tree mutations](sprint-03-projects-files/S03-T04-implement-id-based-file-tree-mutations.md) | Project Co-owner (proposed) | 8 | done |
| S03-T09 | [Verify transaction-safe move rename and delete](sprint-03-projects-files/S03-T09-verify-transaction-safe-move-rename-and-delete.md) | Project Co-owner (proposed) | 6 | done |
| S03-T05 | [Create file tree interactions](sprint-03-projects-files/S03-T05-create-file-tree-interactions.md) | Project Co-owner (proposed) | 8 | done |
| S03-T06 | [Implement project root and compiler settings](sprint-03-projects-files/S03-T06-implement-project-root-and-compiler-settings.md) | Project Co-owner (proposed) | 6 | done |
| S03-T07 | [Create structural revision manifests](sprint-03-projects-files/S03-T07-create-structural-revision-manifests.md) | Project Co-owner (proposed) | 8 | done |
| S03-T08 | [Verify project and tree journey](sprint-03-projects-files/S03-T08-verify-project-and-tree-journey.md) | Project Co-owner (proposed) | 6 | done |
| S04-T01 | [Create LaTeX CodeMirror extensions](sprint-04-code-editor/S04-T01-create-latex-codemirror-extensions.md) | Julio (proposed) | 8 | done |
| S04-T02 | [Create canonical text document service](sprint-04-code-editor/S04-T02-create-canonical-text-document-service.md) | Julio (proposed) | 8 | done |
| S04-T09 | [Persist and replay canonical text updates](sprint-04-code-editor/S04-T09-persist-and-replay-canonical-text-updates.md) | Julio (proposed) | 8 | done |
| S04-T10 | [Implement REST text state-version contract](sprint-04-code-editor/S04-T10-implement-rest-text-state-version-contract.md) | Julio (proposed) | 8 | done |
| S04-T03 | [Connect actual save status and retries](sprint-04-code-editor/S04-T03-connect-actual-save-status-and-retries.md) | Julio (proposed) | 8 | done |
| S04-T04 | [Implement file tabs and navigation](sprint-04-code-editor/S04-T04-implement-file-tabs-and-navigation.md) | Julio (proposed) | 6 | done |
| S04-T05 | [Implement local undo search and shortcuts](sprint-04-code-editor/S04-T05-implement-local-undo-search-and-shortcuts.md) | Julio (proposed) | 6 | done |
| S04-T06 | [Enforce read-only and metadata concurrency](sprint-04-code-editor/S04-T06-enforce-read-only-and-metadata-concurrency.md) | Julio (proposed) | 6 | done |
| S04-T07 | [Create text and binary checkpoints](sprint-04-code-editor/S04-T07-create-text-and-binary-checkpoints.md) | Julio (proposed) | 8 | done |
| S04-T08 | [Verify persistent Unicode editing](sprint-04-code-editor/S04-T08-verify-persistent-unicode-editing.md) | Julio (proposed) | 6 | done |
| S05-T01 | [Implement verified presigned uploads](sprint-05-assets-import-export/S05-T01-implement-verified-presigned-uploads.md) | Project Co-owner (proposed) | 8 | in_progress |
| S05-T09 | [Implement quota and orphan object cleanup](sprint-05-assets-import-export/S05-T09-implement-quota-and-orphan-object-cleanup.md) | Project Co-owner (proposed) | 8 | todo |
| S05-T02 | [Create multi-file upload interactions](sprint-05-assets-import-export/S05-T02-create-multi-file-upload-interactions.md) | Project Co-owner (proposed) | 8 | todo |
| S05-T03 | [Validate archives and define idempotent import job](sprint-05-assets-import-export/S05-T03-validate-archives-and-define-idempotent-import-job.md) | Project Co-owner (proposed) | 8 | todo |
| S05-T10 | [Apply validated import as a consistent project](sprint-05-assets-import-export/S05-T10-apply-validated-import-as-a-consistent-project.md) | Project Co-owner (proposed) | 8 | todo |
| S05-T04 | [Export immutable source ZIP](sprint-05-assets-import-export/S05-T04-export-immutable-source-zip.md) | Project Co-owner (proposed) | 8 | todo |
| S05-T05 | [Preview and download safe binary assets](sprint-05-assets-import-export/S05-T05-preview-and-download-safe-binary-assets.md) | Project Co-owner (proposed) | 6 | todo |
| S05-T06 | [Create minimal versioned internal templates](sprint-05-assets-import-export/S05-T06-create-minimal-versioned-internal-templates.md) | Project Co-owner (proposed) | 8 | todo |
| S05-T11 | [Create template preview and instantiate UI](sprint-05-assets-import-export/S05-T11-create-template-preview-and-instantiate-ui.md) | Project Co-owner (proposed) | 6 | todo |
| S05-T07 | [Verify imported paths and custom styles](sprint-05-assets-import-export/S05-T07-verify-imported-paths-and-custom-styles.md) | Project Co-owner (proposed) | 6 | todo |
| S05-T08 | [Verify hostile ZIP and round-trip journeys](sprint-05-assets-import-export/S05-T08-verify-hostile-zip-and-round-trip-journeys.md) | Project Co-owner (proposed) | 6 | todo |
| S06-T01 | [Create durable compile queue jobs](sprint-06-trusted-compilation/S06-T01-create-durable-compile-queue-jobs.md) | Julio (proposed) | 8 | todo |
| S06-T02 | [Freeze compilation source revision](sprint-06-trusted-compilation/S06-T02-freeze-compilation-source-revision.md) | Julio (proposed) | 8 | todo |
| S06-T12 | [Research trusted TeX runtime and image limits](sprint-06-trusted-compilation/S06-T12-research-trusted-tex-runtime-and-image-limits.md) | Julio (proposed) | 4 | todo |
| S06-T03 | [Build pinned TeX Live image](sprint-06-trusted-compilation/S06-T03-build-pinned-tex-live-image.md) | Julio (proposed) | 8 | todo |
| S06-T04 | [Define compiler executor boundary](sprint-06-trusted-compilation/S06-T04-define-compiler-executor-boundary.md) | Julio (proposed) | 6 | todo |
| S06-T13 | [Implement trusted worker executor adapter](sprint-06-trusted-compilation/S06-T13-implement-trusted-worker-executor-adapter.md) | Julio (proposed) | 8 | todo |
| S06-T05 | [Enforce trusted compiler execution limits](sprint-06-trusted-compilation/S06-T05-enforce-trusted-compiler-execution-limits.md) | Julio (proposed) | 8 | todo |
| S06-T14 | [Implement timeout cancellation and job recovery](sprint-06-trusted-compilation/S06-T14-implement-timeout-cancellation-and-job-recovery.md) | Julio (proposed) | 8 | todo |
| S06-T06 | [Persist verified artifacts and job result](sprint-06-trusted-compilation/S06-T06-persist-verified-artifacts-and-job-result.md) | Julio (proposed) | 8 | todo |
| S06-T07 | [Parse diagnostics and compile failures](sprint-06-trusted-compilation/S06-T07-parse-diagnostics-and-compile-failures.md) | Julio (proposed) | 8 | todo |
| S06-T08 | [Create real PDF viewer](sprint-06-trusted-compilation/S06-T08-create-real-pdf-viewer.md) | Julio (proposed) | 8 | todo |
| S06-T09 | [Connect compile controls and status fallback](sprint-06-trusted-compilation/S06-T09-connect-compile-controls-and-status-fallback.md) | Julio (proposed) | 6 | todo |
| S06-T10 | [Verify genuine compiler fixtures](sprint-06-trusted-compilation/S06-T10-verify-genuine-compiler-fixtures.md) | Julio (proposed) | 8 | todo |
| S06-T11 | [Document trusted execution and closed public mode](sprint-06-trusted-compilation/S06-T11-document-trusted-execution-and-closed-public-mode.md) | Julio (proposed) | 4 | todo |
| S06-T15 | [Deploy trusted staging slice and smoke](sprint-06-trusted-compilation/S06-T15-deploy-trusted-staging-slice-and-smoke.md) | Julio (proposed) | 8 | todo |
| S06-T16 | [Verify trusted-release backup and rollback](sprint-06-trusted-compilation/S06-T16-verify-trusted-release-backup-and-rollback.md) | Julio (proposed) | 8 | todo |
| S06-T17 | [Stabilize and review G1 release](sprint-06-trusted-compilation/S06-T17-stabilize-and-review-g1-release.md) | Julio (proposed) | 8 | todo |
| S07-T01 | [Create authenticated Hocuspocus file rooms](sprint-07-durable-collaboration/S07-T01-create-authenticated-hocuspocus-file-rooms.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T02 | [Implement single-use WSS tickets](sprint-07-durable-collaboration/S07-T02-implement-single-use-wss-tickets.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T03 | [Connect collaborative editor presence and undo](sprint-07-durable-collaboration/S07-T03-connect-collaborative-editor-presence-and-undo.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T04 | [Append durable CRDT updates](sprint-07-durable-collaboration/S07-T04-append-durable-crdt-updates.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T11 | [Implement commit-covered durable acknowledgements](sprint-07-durable-collaboration/S07-T11-implement-commit-covered-durable-acknowledgements.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T12 | [Compact verified CRDT snapshots safely](sprint-07-durable-collaboration/S07-T12-compact-verified-crdt-snapshots-safely.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T05 | [Implement offline persistence and reconnect](sprint-07-durable-collaboration/S07-T05-implement-offline-persistence-and-reconnect.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T06 | [Synchronize tree changes with open rooms](sprint-07-durable-collaboration/S07-T06-synchronize-tree-changes-with-open-rooms.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T07 | [Coordinate two collaboration replicas](sprint-07-durable-collaboration/S07-T07-coordinate-two-collaboration-replicas.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T08 | [Apply live role and session revocation](sprint-07-durable-collaboration/S07-T08-apply-live-role-and-session-revocation.md) | Project Co-owner (proposed) | 8 | todo |
| S07-T09 | [Instrument collaborative durability metrics](sprint-07-durable-collaboration/S07-T09-instrument-collaborative-durability-metrics.md) | Project Co-owner (proposed) | 6 | todo |
| S07-T10 | [Verify convergence failures and recovery](sprint-07-durable-collaboration/S07-T10-verify-convergence-failures-and-recovery.md) | Project Co-owner (proposed) | 8 | todo |
| S08-T01 | [Implement expiring email invitations](sprint-08-sharing-comments-chat/S08-T01-implement-expiring-email-invitations.md) | Julio (proposed) | 8 | todo |
| S08-T02 | [Implement bounded hashed share links](sprint-08-sharing-comments-chat/S08-T02-implement-bounded-hashed-share-links.md) | Julio (proposed) | 8 | todo |
| S08-T03 | [Create sharing and role management UI](sprint-08-sharing-comments-chat/S08-T03-create-sharing-and-role-management-ui.md) | Julio (proposed) | 8 | todo |
| S08-T04 | [Implement anchored comments and replies](sprint-08-sharing-comments-chat/S08-T04-implement-anchored-comments-and-replies.md) | Julio (proposed) | 8 | todo |
| S08-T09 | [Render comment anchor and reply interactions](sprint-08-sharing-comments-chat/S08-T09-render-comment-anchor-and-reply-interactions.md) | Julio (proposed) | 6 | todo |
| S08-T05 | [Create authorized durable project chat](sprint-08-sharing-comments-chat/S08-T05-create-authorized-durable-project-chat.md) | Julio (proposed) | 8 | todo |
| S08-T06 | [Create mention and in-app notifications](sprint-08-sharing-comments-chat/S08-T06-create-mention-and-in-app-notifications.md) | Julio (proposed) | 6 | todo |
| S08-T07 | [Enforce comment chat safety and limits](sprint-08-sharing-comments-chat/S08-T07-enforce-comment-chat-safety-and-limits.md) | Julio (proposed) | 6 | todo |
| S08-T08 | [Verify sharing revocation and detached anchors](sprint-08-sharing-comments-chat/S08-T08-verify-sharing-revocation-and-detached-anchors.md) | Julio (proposed) | 6 | todo |
| S08-T10 | [Stabilize and review G2 collaboration](sprint-08-sharing-comments-chat/S08-T10-stabilize-and-review-g2-collaboration.md) | Julio (proposed) | 8 | todo |
| S09-T01 | [Create immutable labeled history queries](sprint-09-history-review/S09-T01-create-immutable-labeled-history-queries.md) | Project Co-owner (proposed) | 8 | todo |
| S09-T02 | [Compare text tree and binary revisions](sprint-09-history-review/S09-T02-compare-text-tree-and-binary-revisions.md) | Project Co-owner (proposed) | 8 | todo |
| S09-T03 | [Restore file or project with version guard](sprint-09-history-review/S09-T03-restore-file-or-project-with-version-guard.md) | Project Co-owner (proposed) | 8 | todo |
| S09-T04 | [Model reviewer suggestions separately](sprint-09-history-review/S09-T04-model-reviewer-suggestions-separately.md) | Project Co-owner (proposed) | 8 | todo |
| S09-T05 | [Resolve proposals with explicit conflicts](sprint-09-history-review/S09-T05-resolve-proposals-with-explicit-conflicts.md) | Project Co-owner (proposed) | 8 | todo |
| S09-T06 | [Preserve current ACL and historical anchors on restore](sprint-09-history-review/S09-T06-preserve-current-acl-and-historical-anchors-on-restore.md) | Project Co-owner (proposed) | 6 | todo |
| S09-T07 | [Verify concurrent review and file changes](sprint-09-history-review/S09-T07-verify-concurrent-review-and-file-changes.md) | Project Co-owner (proposed) | 6 | todo |
| S09-T08 | [Create explicit restore confirmation UI](sprint-09-history-review/S09-T08-create-explicit-restore-confirmation-ui.md) | Project Co-owner (proposed) | 6 | todo |
| S09-T09 | [Implement archive trash and permanent deletion](sprint-09-history-review/S09-T09-implement-archive-trash-and-permanent-deletion.md) | Project Co-owner (proposed) | 8 | todo |
| S09-T10 | [Implement owned project tags](sprint-09-history-review/S09-T10-implement-owned-project-tags.md) | Project Co-owner (proposed) | 6 | todo |
| S09-T11 | [Implement permission-aware bulk project actions](sprint-09-history-review/S09-T11-implement-permission-aware-bulk-project-actions.md) | Project Co-owner (proposed) | 6 | todo |
| S09-T12 | [Implement explicit ownership transfer](sprint-09-history-review/S09-T12-implement-explicit-ownership-transfer.md) | Project Co-owner (proposed) | 8 | todo |
| S09-T13 | [Export authorized user data](sprint-09-history-review/S09-T13-export-authorized-user-data.md) | Project Co-owner (proposed) | 8 | todo |
| S09-T14 | [Delete account under shared ownership rules](sprint-09-history-review/S09-T14-delete-account-under-shared-ownership-rules.md) | Project Co-owner (proposed) | 8 | todo |
| S10-T01 | [Add tested alternative TeX profiles](sprint-10-academic-editing/S10-T01-add-tested-alternative-tex-profiles.md) | Julio (proposed) | 8 | todo |
| S10-T02 | [Compile bibliography and complete citations](sprint-10-academic-editing/S10-T02-compile-bibliography-and-complete-citations.md) | Julio (proposed) | 8 | todo |
| S10-T03 | [Index BibTeX and search local references](sprint-10-academic-editing/S10-T03-index-bibtex-and-search-local-references.md) | Julio (proposed) | 8 | todo |
| S10-T04 | [Implement forward inverse SyncTeX](sprint-10-academic-editing/S10-T04-implement-forward-inverse-synctex.md) | Julio (proposed) | 8 | todo |
| S10-T05 | [Create valid academic insertion snippets](sprint-10-academic-editing/S10-T05-create-valid-academic-insertion-snippets.md) | Julio (proposed) | 6 | todo |
| S10-T06 | [Complete environments labels and file paths](sprint-10-academic-editing/S10-T06-complete-environments-labels-and-file-paths.md) | Julio (proposed) | 8 | todo |
| S10-T07 | [Report documented project statistics](sprint-10-academic-editing/S10-T07-report-documented-project-statistics.md) | Julio (proposed) | 6 | todo |
| S10-T08 | [Implement project search and previewed replacement](sprint-10-academic-editing/S10-T08-implement-project-search-and-previewed-replacement.md) | Julio (proposed) | 8 | todo |
| S10-T09 | [Persist editor preferences symbols and layout](sprint-10-academic-editing/S10-T09-persist-editor-preferences-symbols-and-layout.md) | Julio (proposed) | 8 | todo |
| S10-T11 | [Add local spell checking and static error help](sprint-10-academic-editing/S10-T11-add-local-spell-checking-and-static-error-help.md) | Julio (proposed) | 6 | todo |
| S10-T10 | [Verify bibliography PDF SyncTeX and keymaps](sprint-10-academic-editing/S10-T10-verify-bibliography-pdf-synctex-and-keymaps.md) | Julio (proposed) | 8 | todo |
| S10-T12 | [Add debounced automatic compilation](sprint-10-academic-editing/S10-T12-add-debounced-automatic-compilation.md) | Julio (proposed) | 8 | todo |
| S10-T13 | [Implement authorized content-aware compiler cache](sprint-10-academic-editing/S10-T13-implement-authorized-content-aware-compiler-cache.md) | Julio (proposed) | 8 | todo |
| S10-T14 | [Implement clean rebuild and retention cleanup](sprint-10-academic-editing/S10-T14-implement-clean-rebuild-and-retention-cleanup.md) | Julio (proposed) | 6 | todo |
| S11-T01 | [Research conservative visual parser](sprint-11-visual-editor/S11-T01-research-conservative-visual-parser.md) | Project Co-owner (proposed) | 4 | todo |
| S11-T02 | [Create source AST projection and range map](sprint-11-visual-editor/S11-T02-create-source-ast-projection-and-range-map.md) | Project Co-owner (proposed) | 8 | todo |
| S11-T03 | [Render basic supported visual nodes](sprint-11-visual-editor/S11-T03-render-basic-supported-visual-nodes.md) | Project Co-owner (proposed) | 8 | todo |
| S11-T04 | [Apply minimal version-checked source patches](sprint-11-visual-editor/S11-T04-apply-minimal-version-checked-source-patches.md) | Project Co-owner (proposed) | 8 | todo |
| S11-T05 | [Render supported math figures tables and cites](sprint-11-visual-editor/S11-T05-render-supported-math-figures-tables-and-cites.md) | Project Co-owner (proposed) | 8 | todo |
| S11-T10 | [Complete simple table and formula editing slices](sprint-11-visual-editor/S11-T10-complete-simple-table-and-formula-editing-slices.md) | Project Co-owner (proposed) | 8 | todo |
| S11-T06 | [Create literal fallback for unsupported TeX](sprint-11-visual-editor/S11-T06-create-literal-fallback-for-unsupported-tex.md) | Project Co-owner (proposed) | 6 | todo |
| S11-T07 | [Make code visual switching read-only](sprint-11-visual-editor/S11-T07-make-code-visual-switching-read-only.md) | Project Co-owner (proposed) | 6 | todo |
| S11-T08 | [Verify 100 non-destructive round-trip fixtures](sprint-11-visual-editor/S11-T08-verify-100-non-destructive-round-trip-fixtures.md) | Project Co-owner (proposed) | 8 | todo |
| S11-T09 | [Verify mixed code visual coediting](sprint-11-visual-editor/S11-T09-verify-mixed-code-visual-coediting.md) | Project Co-owner (proposed) | 8 | todo |
| S11-T11 | [Stabilize and review G3 academic workflow](sprint-11-visual-editor/S11-T11-stabilize-and-review-g3-academic-workflow.md) | Project Co-owner (proposed) | 8 | todo |
| S12-T01 | [Implement GitHub OAuth credential handling](sprint-12-github-sync/S12-T01-implement-github-oauth-credential-handling.md) | Julio (proposed) | 8 | todo |
| S12-T02 | [Link authorized repository and branch](sprint-12-github-sync/S12-T02-link-authorized-repository-and-branch.md) | Julio (proposed) | 8 | todo |
| S12-T03 | [Pull using checkpoint and base SHA](sprint-12-github-sync/S12-T03-pull-using-checkpoint-and-base-sha.md) | Julio (proposed) | 8 | todo |
| S12-T08 | [Apply remote changes through live canonical service](sprint-12-github-sync/S12-T08-apply-remote-changes-through-live-canonical-service.md) | Julio (proposed) | 8 | todo |
| S12-T04 | [Push frozen revision with remote guard](sprint-12-github-sync/S12-T04-push-frozen-revision-with-remote-guard.md) | Julio (proposed) | 8 | todo |
| S12-T05 | [Create sync status diff and resolution UI](sprint-12-github-sync/S12-T05-create-sync-status-diff-and-resolution-ui.md) | Julio (proposed) | 8 | todo |
| S12-T06 | [Export authorized revision artifacts and links](sprint-12-github-sync/S12-T06-export-authorized-revision-artifacts-and-links.md) | Julio (proposed) | 6 | todo |
| S12-T07 | [Verify GitHub failure concurrency cases](sprint-12-github-sync/S12-T07-verify-github-failure-concurrency-cases.md) | Julio (proposed) | 8 | todo |
| S13-T01 | [Define provider adapter and connection lifecycle](sprint-13-reference-providers/S13-T01-define-provider-adapter-and-connection-lifecycle.md) | Project Co-owner (proposed) | 8 | todo |
| S13-T02 | [Import and refresh authorized Zotero library](sprint-13-reference-providers/S13-T02-import-and-refresh-authorized-zotero-library.md) | Project Co-owner (proposed) | 8 | todo |
| S13-T03 | [Research Mendeley Papers access and terms](sprint-13-reference-providers/S13-T03-research-mendeley-papers-access-and-terms.md) | Project Co-owner (proposed) | 4 | todo |
| S13-T07 | [Implement one permitted optional bibliography provider](sprint-13-reference-providers/S13-T07-implement-one-permitted-optional-bibliography-provider.md) | Project Co-owner (proposed) | 8 | todo |
| S13-T04 | [Implement authorized manual Dropbox export](sprint-13-reference-providers/S13-T04-implement-authorized-manual-dropbox-export.md) | Project Co-owner (proposed) | 8 | todo |
| S13-T08 | [Add optional bidirectional Dropbox synchronization](sprint-13-reference-providers/S13-T08-add-optional-bidirectional-dropbox-synchronization.md) | Project Co-owner (proposed) | 8 | todo |
| S13-T05 | [Import editable individual references](sprint-13-reference-providers/S13-T05-import-editable-individual-references.md) | Project Co-owner (proposed) | 6 | todo |
| S13-T06 | [Verify provider contract and real connectivity](sprint-13-reference-providers/S13-T06-verify-provider-contract-and-real-connectivity.md) | Project Co-owner (proposed) | 8 | todo |
| S14-T01 | [Research Git HTTP implementation and mapping](sprint-14-git-and-optional-features/S14-T01-research-git-http-implementation-and-mapping.md) | Julio (proposed) | 4 | todo |
| S14-T02 | [Create authenticated Git bridge service](sprint-14-git-and-optional-features/S14-T02-create-authenticated-git-bridge-service.md) | Julio (proposed) | 8 | todo |
| S14-T03 | [Implement actual clone fetch and push](sprint-14-git-and-optional-features/S14-T03-implement-actual-clone-fetch-and-push.md) | Julio (proposed) | 8 | todo |
| S14-T04 | [Apply Git imports through canonical mutation service](sprint-14-git-and-optional-features/S14-T04-apply-git-imports-through-canonical-mutation-service.md) | Julio (proposed) | 8 | todo |
| S14-T05 | [Deliver preference-controlled email notifications](sprint-14-git-and-optional-features/S14-T05-deliver-preference-controlled-email-notifications.md) | Julio (proposed) | 8 | todo |
| S14-T06 | [Add optional private writing assistance](sprint-14-git-and-optional-features/S14-T06-add-optional-private-writing-assistance.md) | Julio (proposed) | 8 | todo |
| S14-T07 | [Implement safe social OAuth account linking](sprint-14-git-and-optional-features/S14-T07-implement-safe-social-oauth-account-linking.md) | Julio (proposed) | 8 | todo |
| S14-T09 | [Profile additional compiler packages and fonts](sprint-14-git-and-optional-features/S14-T09-profile-additional-compiler-packages-and-fonts.md) | Julio (proposed) | 6 | todo |
| S14-T10 | [Implement SSRF-safe permitted remote resource import](sprint-14-git-and-optional-features/S14-T10-implement-ssrf-safe-permitted-remote-resource-import.md) | Julio (proposed) | 8 | todo |
| S14-T11 | [Implement optional TOTP challenge and recovery slice](sprint-14-git-and-optional-features/S14-T11-implement-optional-totp-challenge-and-recovery-slice.md) | Julio (proposed) | 8 | todo |
| S14-T08 | [Verify real Git protocol and token revocation](sprint-14-git-and-optional-features/S14-T08-verify-real-git-protocol-and-token-revocation.md) | Julio (proposed) | 8 | todo |
| S14-T12 | [Stabilize and review supported G4 integrations](sprint-14-git-and-optional-features/S14-T12-stabilize-and-review-supported-g4-integrations.md) | Julio (proposed) | 8 | todo |
| S15-T01 | [Research verified public isolation primitives](sprint-15-public-hardening/S15-T01-research-verified-public-isolation-primitives.md) | Project Co-owner (proposed) | 4 | todo |
| S15-T13 | [Provision verified isolated executor adapter](sprint-15-public-hardening/S15-T13-provision-verified-isolated-executor-adapter.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T02 | [Audit TeX escape and resource attacks](sprint-15-public-hardening/S15-T02-audit-tex-escape-and-resource-attacks.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T03 | [Route public mode through verified executor](sprint-15-public-hardening/S15-T03-route-public-mode-through-verified-executor.md) | Project Co-owner (proposed) | 6 | todo |
| S15-T04 | [Verify multi-replica API and collab deployment](sprint-15-public-hardening/S15-T04-verify-multi-replica-api-and-collab-deployment.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T05 | [Measure REST WS and compile load](sprint-15-public-hardening/S15-T05-measure-rest-ws-and-compile-load.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T06 | [Automate complete backup and restore](sprint-15-public-hardening/S15-T06-automate-complete-backup-and-restore.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T07 | [Create privacy-preserving telemetry and alerts](sprint-15-public-hardening/S15-T07-create-privacy-preserving-telemetry-and-alerts.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T08 | [Audit delivered API WSS files and integrations](sprint-15-public-hardening/S15-T08-audit-delivered-api-wss-files-and-integrations.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T09 | [Enforce abuse quotas flags and admin permissions](sprint-15-public-hardening/S15-T09-enforce-abuse-quotas-flags-and-admin-permissions.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T10 | [Review accessibility browsers and operating docs](sprint-15-public-hardening/S15-T10-review-accessibility-browsers-and-operating-docs.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T11 | [Audit every feature ID and claim](sprint-15-public-hardening/S15-T11-audit-every-feature-id-and-claim.md) | Project Co-owner (proposed) | 6 | todo |
| S15-T14 | [Stabilize public candidate and review release evidence](sprint-15-public-hardening/S15-T14-stabilize-public-candidate-and-review-release-evidence.md) | Project Co-owner (proposed) | 8 | todo |
| S15-T12 | [Approve and enable optional public signup](sprint-15-public-hardening/S15-T12-approve-and-enable-optional-public-signup.md) | Project Co-owner (proposed) | 4 | todo |

## Critical Path

```text
G1: S00 -> S01 -> S02 -> S03 -> S04 -> S05 -> S06
G2: S06 -> S07 -> S08
G3: S08 -> S09 -> S10 -> S11
G4: S11 -> S12 -> S13 -> S14
G5: S14 -> S15 (optional public operation)
```

Conservative dependency sequence; no promised dates or calendar slack. Use YAML depends_on and the roadmap explanation before reordering. Added IDs append numerically but execution placement follows prerequisites. 139 original IDs are preserved and 44 additional slices close gaps or split broad work.

## Cross-Cutting Rules

- Test-first code slices; criterion-first review for documentation/research.
- One reviewable task/commit: `feat(scope): describe change (S00-T01)`; detect base branch and preserve contributor changes.
- Strict TypeScript, pure policies, deterministic unit tests with no network; real integration tests separately.
- Server permissions and private objects; durable ACK; immutable compile revision; verified executor trust profile.
- Never edit shared lockfiles/contracts/migrations simultaneously without coordination. Any parallel workflow must use stable contracts and a single integration owner.
- Quality gate table is [doc 06](../docs/planning/06-ci-cd-and-environments.md); never mark missing scripts/credentials or fake output PASS.
- Owner/effort are explicit planning proposals. Re-estimate and split any unstarted unit whose likely effort exceeds 8 h.

## Document Control

Source: the original Spanish master plan and PLANNING_METHODOLOGY.md. Team/schedule/scope adaptation comes from the 2026-10-09 conversation. Initial migration preserves original IDs, adds missing scoped tasks and English contracts, records delegated scope baseline, and initializes evidence as NOT_STARTED. Future changes update front matter, index, roadmap and traceability together.

Run `python scripts/plan_lint.py` after every plan change. It validates this index against task front matter, sub-task/task/sprint totals, requirement mapping, the acyclic dependency graph and local document links. A structural PASS is not a product Ready/Done verdict.
