# Implementation Roadmap

**Goal:** Deliver an extracurricular collaborative LaTeX workspace through tested increments, starting with trusted G1.
**Architecture:** Typed browser/API/services with canonical Yjs text, PostgreSQL durability, private objects and separate compilation.
**Tech Stack:** React/Vite/TypeScript, Fastify, Drizzle/PostgreSQL, Yjs/Hocuspocus, Redis/BullMQ, TeX Live, PDF.js.
**Spec:** [Technical Specification](03-technical-spec.md) and [Discovery](00-discovery.md).

## Scheduling and Estimate Basis

Sprints are dependency stages with no fixed start/end or two-week promise, by explicit user instruction. Owner assignments alternate as ASSUMPTION A-02; estimates are active person-hours as ASSUMPTION A-03, not measured throughput. Each task has a likely 4–8 h estimate, optimistic/likely/pessimistic range, <=2 h steps and a Ready split trigger. A pessimistic range >8 h requires re-estimation/splitting before work is taken.

One owner is accountable per stage; either contributor may help under coordination. Work is conservatively ordered for the same two contributors; reorder independent tasks only after preserving their contracts and actual dependency DAG. Original IDs are unchanged; added task IDs append numerically and are deliberately placed next to their prerequisite, so execution order is not always numeric.

## Global Constraints

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Review Focus

- Duplicate null-parent filenames must not bypass active-name uniqueness.
- Durable ACK must cover committed local clocks across replica crashes.
- Snapshot/restore must retain current ACLs and hash-consistent objects.
- Compiler timeout/cancel/retry must retain frozen revision provenance.
- Visual/provider mutations must not overwrite concurrent or unsupported source.

## Sprint S00: Bootstrap and walking skeleton (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 66 h (ASSUMPTION A-03) | **Status:** ✅ DONE | **Owner:** Julio (proposed A-02)
**Goal:** Bootstrap and walking skeleton for G1, using independently verified slices.

### Deliverables

1. `docs/progress/repository-audit.md`
2. `docs/adr/compatibility-spike.md`
3. `AGENTS.md`
4. `package.json`
5. `pnpm-workspace.yaml`
6. `turbo.json`
7. `apps/web/src/app/router.tsx`
8. `apps/web/src/app/providers.tsx`
9. `apps/api/src/server.ts`
10. `apps/api/src/plugins/errors.ts`
11. `eslint.config.js`
12. `tsconfig.base.json`
13. `.github/workflows/ci.yml`
14. `infra/docker-compose.yml`
15. `packages/config/src/index.ts`
16. `.env.example`
17. `apps/web/src/features/health/health-panel.tsx`
18. `tests/e2e/walking-skeleton.spec.ts`
19. `docs/adr/001-stack.md`
20. `docs/adr/002-crdt.md`
21. `docs/adr/003-storage.md`
22. `docs/adr/004-compiler.md`
23. `docs/adr/005-tenancy.md`
24. `docs/feature-parity.md`
25. `README.md`
26. `infra/scripts/smoke.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S00-T01](../../implementation/sprint-00-bootstrap/S00-T01-inspect-repository-and-preserve-contributor-changes.md) | Inspect repository and preserve contributor changes | 4 | Julio | ✅ done | Record tracked/untracked files, toolchain, hardware prerequisites and safe bootstrap actions; preserve both source documents byte-for-byte |
| [S00-T11](../../implementation/sprint-00-bootstrap/S00-T11-check-editor-collaboration-dependency-compatibility.md) | Check editor collaboration dependency compatibility | 4 | Julio | ✅ done | Within 4h verify licensed Yjs 13/Hocuspocus/CodeMirror peer compatibility and pin a candidate or record blocker |
| [S00-T02](../../implementation/sprint-00-bootstrap/S00-T02-write-permanent-agent-execution-rules.md) | Write permanent agent execution rules | 4 | Julio | ✅ done | Rules enforce real functionality, trust boundary, per-task evidence and preservation of user work; retain the existing graphify trigger instruction |
| [S00-T03](../../implementation/sprint-00-bootstrap/S00-T03-create-typed-pnpm-monorepo.md) | Create typed pnpm monorepo | 6 | Julio | ✅ done | All apps/packages resolve under pinned pnpm and strict TypeScript with a frozen lockfile install |
| [S00-T04](../../implementation/sprint-00-bootstrap/S00-T04-create-browser-shell-and-route-providers.md) | Create browser shell and route providers | 6 | Julio | ✅ done | Browser shell loads routing/theme/providers and marks unavailable product views explicitly unavailable |
| [S00-T05](../../implementation/sprint-00-bootstrap/S00-T05-create-api-health-and-error-boundary.md) | Create API health and error boundary | 6 | Julio | ✅ done | Live health returns 200; readiness returns 503 when a required dependency fails; errors include requestId without secrets |
| [S00-T06](../../implementation/sprint-00-bootstrap/S00-T06-configure-code-quality-and-ci.md) | Configure code quality and CI | 8 | Julio | ✅ done | Format/lint/strict types/test/build run identically locally and CI; forbidden browser-to-server import fails lint |
| [S00-T07](../../implementation/sprint-00-bootstrap/S00-T07-create-local-services-and-validated-configuration.md) | Create local services and validated configuration | 8 | Julio | ✅ done | PG/Redis/MinIO/Mailpit start locally; missing required config fails startup; public config contains no secret |
| [S00-T12](../../implementation/sprint-00-bootstrap/S00-T12-deliver-browser-to-api-walking-skeleton.md) | Deliver browser to API walking skeleton | 6 | Julio | ✅ done | Browser renders API readiness from a real running server, shows outage and passes CI smoke; no fake application functionality |
| [S00-T08](../../implementation/sprint-00-bootstrap/S00-T08-record-initial-architecture-decisions.md) | Record initial architecture decisions | 4 | Julio | ✅ done | Each ADR records alternatives and consequences; unresolved version/runtime checks remain explicit |
| [S00-T09](../../implementation/sprint-00-bootstrap/S00-T09-initialize-feature-and-evidence-inventory.md) | Initialize feature and evidence inventory | 4 | Julio | ✅ done | All 74 source feature IDs plus NFRs are unique and mapped; no feature is marked DONE before test evidence |
| [S00-T10](../../implementation/sprint-00-bootstrap/S00-T10-document-clean-development-startup.md) | Document clean development startup | 6 | Julio | ✅ done | A clean clone follows documented setup through service readiness and workspace build without real credentials |

### DoD

- [x] Every task's acceptance and declared scope has actual evidence.
- [x] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [x] Permissions, persistence, privacy and real outputs are verified.
- [x] Contracts, progress, feature matrix and actual effort are updated.
- [x] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R14 → S00-T02/S00-T09 execution rules and honest inventory.

## Sprint S01: Data and typed interfaces (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 72 h (ASSUMPTION A-03) | **Status:** ✅ DONE | **Owner:** Project Co-owner (proposed A-02)
**Goal:** Data and typed interfaces for G1, using independently verified slices.

### Deliverables

1. `packages/db/src/schema/core.ts`
2. `packages/db/migrations/0001-core.sql`
3. `packages/db/src/client.ts`
4. `packages/db/src/repositories/projects.ts`
5. `packages/db/src/schema/collaboration.ts`
6. `packages/db/src/schema/integrations.ts`
7. `packages/db/migrations/0002-support.sql`
8. `packages/contracts/src/index.ts`
9. `docs/api/openapi.json`
10. `packages/db/seeds/development.ts`
11. `packages/test-utils/src/factories.ts`
12. `tests/integration/database-constraints.test.ts`
13. `packages/storage/src/s3.ts`
14. `apps/api/src/modules/development/sample.ts`
15. `tests/integration/persisted-sample.test.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S01-T01](../../implementation/sprint-01-data-contracts/S01-T01-define-core-drizzle-entities.md) | Define core Drizzle entities | 8 | Project Co-owner | ✅ done | Users/sessions/projects/members/nodes/revisions/jobs/artifacts expose typed fields and constraints specified by the data contract |
| [S01-T02](../../implementation/sprint-01-data-contracts/S01-T02-create-sql-migrations-and-constraints.md) | Create SQL migrations and constraints | 8 | Project Co-owner | ✅ done | Fresh migration applies; cross-project parent and duplicate active name fail; roots with null parent cannot bypass uniqueness |
| [S01-T03](../../implementation/sprint-01-data-contracts/S01-T03-create-transaction-and-repository-primitives.md) | Create transaction and repository primitives | 6 | Project Co-owner | ✅ done | Transactions commit/rollback explicitly; cursor ordering is stable and cursors reject tampering |
| [S01-T04](../../implementation/sprint-01-data-contracts/S01-T04-define-future-collaboration-and-integration-tables.md) | Define future collaboration and integration tables | 8 | Project Co-owner | ✅ done | CRDT/invite/comment/suggestion/provider/audit fields satisfy the contract without claiming their behaviors implemented |
| [S01-T09](../../implementation/sprint-01-data-contracts/S01-T09-complete-support-entity-migration-slices.md) | Complete support entity migration slices | 8 | Project Co-owner | ✅ done | Review/provider/template/notification/quota/flag tables migrate with indexes and constraints independently of their future behavior |
| [S01-T05](../../implementation/sprint-01-data-contracts/S01-T05-implement-zod-dtos-and-openapi-generation.md) | Implement Zod DTOs and OpenAPI generation | 8 | Project Co-owner | ✅ done | Input/output validators and generated API agree with planned OpenAPI; database-only fields never reach browser DTOs |
| [S01-T06](../../implementation/sprint-01-data-contracts/S01-T06-create-isolated-seeds-and-fixtures.md) | Create isolated seeds and fixtures | 6 | Project Co-owner | ✅ done | Four roles, three projects and two templates exist only in development/test; production seed refuses fixed credentials |
| [S01-T07](../../implementation/sprint-01-data-contracts/S01-T07-test-constraints-rollback-and-naming-races.md) | Test constraints rollback and naming races | 6 | Project Co-owner | ✅ done | Concurrent same-name creation yields one active node; rollback and same-project FKs preserve invariants |
| [S01-T08](../../implementation/sprint-01-data-contracts/S01-T08-create-private-s3-adapter.md) | Create private S3 adapter | 8 | Project Co-owner | ✅ done | put/get/head/delete/presign obey scoped keys; unauthorized cross-project URL is denied and expected SHA-256 matches |
| [S01-T10](../../implementation/sprint-01-data-contracts/S01-T10-deliver-persisted-development-sample-vertical-slice.md) | Deliver persisted development sample vertical slice | 6 | Project Co-owner | ✅ done | Development-only sample read traverses API to PG/object storage and survives restart; route absent in production |

### DoD

- [x] Every task's acceptance and declared scope has actual evidence.
- [x] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [x] Permissions, persistence, privacy and real outputs are verified.
- [x] Contracts, progress, feature matrix and actual effort are updated.
- [x] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R2/R5/R11/R13/R14 → the stage's scoped contract, persistence, permission and review assertions; do not mark apparent functionality Done.

Shared S01 contract deliverable: `packages/contracts/src/storage.ts` (S01-T08).

## Sprint S02: Identity and permissions (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 78 h (ASSUMPTION A-03) | **Status:** ⬜ NOT_STARTED | **Owner:** Julio (proposed A-02)
**Goal:** Identity and permissions for G1, using independently verified slices.

### Deliverables

1. `apps/api/src/modules/auth/register.ts`
2. `apps/api/src/modules/auth/verify-email.ts`
3. `apps/api/src/modules/auth/session.ts`
4. `apps/api/src/plugins/csrf.ts`
5. `apps/api/src/modules/auth/password-reset.ts`
6. `apps/api/src/plugins/require-session.ts`
7. `packages/auth/src/project-policy.ts`
8. `apps/web/src/features/auth/auth-forms.tsx`
9. `apps/api/src/plugins/rate-limit.ts`
10. `apps/api/src/plugins/logging.ts`
11. `packages/db/src/repositories/audit.ts`
12. `apps/api/src/modules/account/profile.ts`
13. `apps/web/src/features/account/profile.tsx`
14. `apps/api/src/modules/account/password-change.ts`
15. `apps/api/src/modules/account/avatar.ts`
16. `apps/web/src/features/account/avatar.tsx`
17. `tests/security/auth-tenancy.test.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S02-T01](../../implementation/sprint-02-identity-permissions/S02-T01-implement-registration-and-verification.md) | Implement registration and verification | 8 | Julio | ✅ done | Normalized unique email plus Argon2id hash persist; verification expires and can be consumed once |
| [S02-T02](../../implementation/sprint-02-identity-permissions/S02-T02-implement-cookie-sessions-and-logout.md) | Implement cookie sessions and logout | 8 | Julio | ✅ done | Secure host-only cookie, CSRF check, expiry/rotation and logout revocation pass expected 401/403 cases |
| [S02-T03](../../implementation/sprint-02-identity-permissions/S02-T03-implement-password-recovery.md) | Implement password recovery | 8 | Julio | ✅ done | Known/unknown emails have indistinguishable accepted response; hashed token expires/uses once and resets revoke sessions |
| [S02-T04](../../implementation/sprint-02-identity-permissions/S02-T04-implement-session-and-project-policy-guards.md) | Implement session and project policy guards | 8 | Julio | ✅ done | Server denies every unsupported action by default; wrong tenant yields no project content; role policy is pure and tested |
| [S02-T05](../../implementation/sprint-02-identity-permissions/S02-T05-create-accessible-authentication-forms.md) | Create accessible authentication forms | 8 | Julio | ✅ done | Register/login/verify/forgot/reset work through real API with network and 429 states, labels and keyboard focus |
| [S02-T06](../../implementation/sprint-02-identity-permissions/S02-T06-add-authentication-rate-limits-and-redaction.md) | Add authentication rate limits and redaction | 6 | Julio | ✅ done | Repeated auth abuse returns 429 with Retry-After; password/token values never appear in captured logs |
| [S02-T09](../../implementation/sprint-02-identity-permissions/S02-T09-create-redacted-audit-event-writer.md) | Create redacted audit event writer | 6 | Julio | ✅ done | Creation/login/revocation actions persist requestId and redacted metadata; no password/token/source body enters audit |
| [S02-T07](../../implementation/sprint-02-identity-permissions/S02-T07-implement-profile-preferences-and-session-management.md) | Implement profile preferences and session management | 8 | Julio | ✅ done | Profile/preferences persist, sessions can be listed/revoked and user-specific locale/timezone/theme survive reload |
| [S02-T10](../../implementation/sprint-02-identity-permissions/S02-T10-implement-authenticated-password-change.md) | Implement authenticated password change | 6 | Julio | ✅ done | Verify current password and CSRF, replace Argon2id hash, invalidate other sessions and reject incorrect password without changes |
| [S02-T11](../../implementation/sprint-02-identity-permissions/S02-T11-implement-private-avatar-upload-lifecycle.md) | Implement private avatar upload lifecycle | 6 | Julio | ✅ done | Validated bounded avatar is scoped to user, profile displays it, replacement schedules old private blob cleanup and foreign modification fails |
| [S02-T08](../../implementation/sprint-02-identity-permissions/S02-T08-verify-tenancy-revocation-suspension-and-csrf.md) | Verify tenancy revocation suspension and CSRF | 6 | Julio | ✅ done | 401/403, disabled user, revoked cookie, forged CSRF and another-project IDs are rejected without private output |

### DoD

- [ ] Every task's acceptance and declared scope has actual evidence.
- [ ] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [ ] Permissions, persistence, privacy and real outputs are verified.
- [ ] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R2/R5/R11/R13/R14 → the stage's scoped contract, persistence, permission and review assertions; do not mark apparent functionality Done.

## Sprint S03: Projects and file tree (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 66 h (ASSUMPTION A-03) | **Status:** ✅ DONE | **Owner:** Project Co-owner (proposed A-02)
**Goal:** Projects and file tree for G1, using independently verified slices.

### Deliverables

1. `apps/api/src/modules/projects/routes.ts`
2. `apps/api/src/modules/projects/create.ts`
3. `apps/api/src/modules/projects/clone.ts`
4. `apps/web/src/features/projects/dashboard.tsx`
5. `apps/api/src/modules/files/tree.ts`
6. `tests/integration/tree-races.test.ts`
7. `apps/web/src/features/files/file-tree.tsx`
8. `apps/api/src/modules/projects/settings.ts`
9. `apps/web/src/features/projects/settings.tsx`
10. `packages/db/src/repositories/revisions.ts`
11. `tests/e2e/project-tree.spec.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S03-T01](../../implementation/sprint-03-projects-files/S03-T01-implement-project-crud-and-pagination.md) | Implement project CRUD and pagination | 8 | Project Co-owner | ✅ done | List/create/read/update/delete check author/membership and stable pagination/search/filter/order contracts |
| [S03-T02](../../implementation/sprint-03-projects-files/S03-T02-create-duplicate-and-rename-project-sources.md) | Create duplicate and rename project sources | 8 | Project Co-owner | ✅ done | Blank project has valid main.tex; clone copies source without memberships or external secrets; title changes persist |
| [S03-T03](../../implementation/sprint-03-projects-files/S03-T03-create-api-backed-dashboard.md) | Create API-backed dashboard | 8 | Project Co-owner | ✅ done | Owned/shared/recent projects render through API pagination with empty/loading/error states |
| [S03-T04](../../implementation/sprint-03-projects-files/S03-T04-implement-id-based-file-tree-mutations.md) | Implement ID-based file tree mutations | 8 | Project Co-owner | ✅ done | Create/move/rename/delete reject cycles, traversal, foreign parent and stale If-Match; committed treeVersion increments |
| [S03-T09](../../implementation/sprint-03-projects-files/S03-T09-verify-transaction-safe-move-rename-and-delete.md) | Verify transaction-safe move rename and delete | 6 | Project Co-owner | ✅ done | Competing parent/name/version operations yield one committed tree state and explicit conflicts; no orphan or cyclic nodes |
| [S03-T05](../../implementation/sprint-03-projects-files/S03-T05-create-file-tree-interactions.md) | Create file tree interactions | 8 | Project Co-owner | ✅ done | Context menu/dialog/breadcrumb actions call actual routes and recover from 403/409 without phantom nodes |
| [S03-T06](../../implementation/sprint-03-projects-files/S03-T06-implement-project-root-and-compiler-settings.md) | Implement project root and compiler settings | 6 | Project Co-owner | ✅ done | Only same-project active .tex may be root; engine is allowlisted and server caps client timeout options |
| [S03-T07](../../implementation/sprint-03-projects-files/S03-T07-create-structural-revision-manifests.md) | Create structural revision manifests | 8 | Project Co-owner | ✅ done | Structural mutation makes an immutable consistent revision; manifest pins paths/hashes/settings and increments project revision |
| [S03-T08](../../implementation/sprint-03-projects-files/S03-T08-verify-project-and-tree-journey.md) | Verify project and tree journey | 6 | Project Co-owner | ✅ done | Create/rename/open/create-node/move/delete journey persists across reload and never accesses another project |

### DoD

- [x] Every task's acceptance and declared scope has actual evidence.
- [x] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [x] Permissions, persistence, privacy and real outputs are verified.
- [x] Contracts, progress, feature matrix and actual effort are updated.
- [x] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R2/R5/R11/R13/R14 → the stage's scoped contract, persistence, permission and review assertions; do not mark apparent functionality Done.

## Sprint S04: Code editor and durable text (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 72 h (ASSUMPTION A-03) | **Status:** ✅ DONE | **Owner:** Julio (proposed A-02)
**Goal:** Code editor and durable text for G1, using independently verified slices.

### Deliverables

1. `packages/editor/src/latex-extension.ts`
2. `apps/web/src/features/editor/latex-code-editor.tsx`
3. `apps/api/src/modules/text/text-document-service.ts`
4. `apps/api/src/modules/text/update-store.ts`
5. `apps/api/src/modules/text/routes.ts`
6. `apps/web/src/features/editor/persistence.ts`
7. `apps/web/src/features/editor/editor-tabs.tsx`
8. `packages/editor/src/keymap.ts`
9. `apps/web/src/features/editor/permissions.ts`
10. `apps/api/src/modules/files/version-guard.ts`
11. `apps/api/src/modules/history/checkpoint.ts`
12. `tests/e2e/editor-persistence.spec.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S04-T01](../../implementation/sprint-04-code-editor/S04-T01-create-latex-codemirror-extensions.md) | Create LaTeX CodeMirror extensions | 8 | Julio | ✅ done | LaTeX/BibTeX/style/plain-text modes support lines/folding/theme and preserve Unicode source |
| [S04-T02](../../implementation/sprint-04-code-editor/S04-T02-create-canonical-text-document-service.md) | Create canonical text document service | 8 | Julio | ✅ done | TextDocumentService loads/applies Yjs state; committed content is recoverable after API restart and never diverges from a second text column |
| [S04-T09](../../implementation/sprint-04-code-editor/S04-T09-persist-and-replay-canonical-text-updates.md) | Persist and replay canonical text updates | 8 | Julio | ✅ done | Yjs update commit plus snapshot replay recovers identical text/hash after crash; duplicate replay does not double insert |
| [S04-T10](../../implementation/sprint-04-code-editor/S04-T10-implement-rest-text-state-version-contract.md) | Implement REST text state-version contract | 8 | Julio | ✅ done | Authorized read/save with base state vector returns committed coverage; stale single-editor save reports conflict and text remains recoverable |
| [S04-T03](../../implementation/sprint-04-code-editor/S04-T03-connect-actual-save-status-and-retries.md) | Connect actual save status and retries | 8 | Julio | ✅ done | Save status reaches saved only after committed coverage; retry/outage preserves pending text and gives visible error |
| [S04-T04](../../implementation/sprint-04-code-editor/S04-T04-implement-file-tabs-and-navigation.md) | Implement file tabs and navigation | 6 | Julio | ✅ done | Switch files repeatedly without losing buffer/selection/undo state; deleted files close with a visible reason |
| [S04-T05](../../implementation/sprint-04-code-editor/S04-T05-implement-local-undo-search-and-shortcuts.md) | Implement local undo search and shortcuts | 6 | Julio | ✅ done | Undo/redo/comment/search/indent/go-to-line/save/compile shortcuts match their commands; local undo never reverses another origin |
| [S04-T06](../../implementation/sprint-04-code-editor/S04-T06-enforce-read-only-and-metadata-concurrency.md) | Enforce read-only and metadata concurrency | 6 | Julio | ✅ done | Viewer edits are rejected server-side; visible 403 and stale metadata 409/412 cannot silently overwrite content |
| [S04-T07](../../implementation/sprint-04-code-editor/S04-T07-create-text-and-binary-checkpoints.md) | Create text and binary checkpoints | 8 | Julio | ✅ done | Explicit save/compile checkpoint includes text and binary hashes without creating one full revision per keystroke |
| [S04-T08](../../implementation/sprint-04-code-editor/S04-T08-verify-persistent-unicode-editing.md) | Verify persistent Unicode editing | 6 | Julio | ✅ done | Write UTF-8/emoji/Spanish/RTL, refresh and restart API; recovered confirmed text equals original bytes |

### DoD

- [x] Every task's acceptance and declared scope has actual evidence.
- [x] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [x] Permissions, persistence, privacy and real outputs are verified.
- [x] Contracts, progress, feature matrix and actual effort are updated.
- [x] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R2/R5/R11/R13/R14 → the stage's scoped contract, persistence, permission and review assertions; do not mark apparent functionality Done.

## Sprint S05: Assets ZIP and templates (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 88 h (ASSUMPTION A-03) | **Status:** 🟨 IN_PROGRESS | **Owner:** Project Co-owner (proposed A-02)
**Goal:** Assets ZIP and templates for G1, using independently verified slices.

### Deliverables

1. `apps/api/src/modules/uploads/routes.ts`
2. `apps/jobs/src/maintenance/storage-gc.ts`
3. `apps/web/src/features/files/file-uploader.tsx`
4. `apps/jobs/src/imports/zip.ts`
5. `apps/api/src/modules/imports/routes.ts`
6. `apps/jobs/src/imports/apply-project.ts`
7. `apps/jobs/src/exports/zip.ts`
8. `apps/web/src/features/files/binary-preview.tsx`
9. `apps/api/src/modules/templates/routes.ts`
10. `apps/web/src/features/templates/catalogue.tsx`
11. `apps/web/src/features/templates/template-preview.tsx`
12. `tests/integration/zip-project-tree.test.ts`
13. `tests/security/zip-import.test.ts`
14. `tests/e2e/zip-round-trip.spec.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S05-T01](../../implementation/sprint-05-assets-import-export/S05-T01-implement-verified-presigned-uploads.md) | Implement verified presigned uploads | 8 | Project Co-owner | ✅ done | Presign checks project permission/extension/MIME/size; completion checks backend object hash and size before creating node |
| [S05-T09](../../implementation/sprint-05-assets-import-export/S05-T09-implement-quota-and-orphan-object-cleanup.md) | Implement quota and orphan object cleanup | 8 | Project Co-owner | ✅ done | Reference-checked GC never deletes referenced revisions/artifacts; uploads within configured byte/node quota succeed and excess rejects |
| [S05-T02](../../implementation/sprint-05-assets-import-export/S05-T02-create-multi-file-upload-interactions.md) | Create multi-file upload interactions | 8 | Project Co-owner | ✅ done | Drag/drop multiple files tracks progress/cancel/retry and exposes per-file errors without duplicate nodes |
| [S05-T03](../../implementation/sprint-05-assets-import-export/S05-T03-validate-archives-and-define-idempotent-import-job.md) | Validate archives and define idempotent import job | 8 | Project Co-owner | ✅ done | Validated archive rejects traversal/bombs/symlinks and records an idempotent staged import job; application to canonical project state is S05-T10 |
| [S05-T12](../../implementation/sprint-05-assets-import-export/S05-T12-implement-authenticated-zip-import-intake.md) | Implement authenticated ZIP import intake | 8 | Project Co-owner | ✅ done | Current-session signed ZIP PUT verifies actual bytes/hash and enqueues one actor-scoped import job; foreign/forged/reused input is denied |
| [S05-T10](../../implementation/sprint-05-assets-import-export/S05-T10-apply-validated-import-as-a-consistent-project.md) | Apply validated import as a consistent project | 8 | Project Co-owner | ✅ done | Validated archive creates ID-based tree and canonical text/binary state transactionally; retry cannot leave partial duplicated project |
| [S05-T04](../../implementation/sprint-05-assets-import-export/S05-T04-export-immutable-source-zip.md) | Export immutable source ZIP | 8 | Project Co-owner | ✅ done | ZIP contains only authorized manifest paths at one frozen revision; hashes survive import round trip |
| [S05-T05](../../implementation/sprint-05-assets-import-export/S05-T05-preview-and-download-safe-binary-assets.md) | Preview and download safe binary assets | 6 | Project Co-owner | ✅ done | Permitted images/PDF use authorized resources; active HTML/SVG are attachment-only and never execute in trusted UI |
| [S05-T06](../../implementation/sprint-05-assets-import-export/S05-T06-create-minimal-versioned-internal-templates.md) | Create minimal versioned internal templates | 8 | Project Co-owner | ✅ done | Two original templates have versioned manifests; instantiate produces editable main.tex and no copied external authorization |
| [S05-T11](../../implementation/sprint-05-assets-import-export/S05-T11-create-template-preview-and-instantiate-ui.md) | Create template preview and instantiate UI | 6 | Project Co-owner | ✅ done | Catalogue filter/detail and instantiate use real versioned manifest; preview assets authorized and new project is independent |
| [S05-T07](../../implementation/sprint-05-assets-import-export/S05-T07-verify-imported-paths-and-custom-styles.md) | Verify imported paths and custom styles | 6 | Project Co-owner | ⬜ todo | Nested .tex/.sty/.cls/image fixture preserves paths and bytes; active-name collisions report explicit conflict |
| [S05-T08](../../implementation/sprint-05-assets-import-export/S05-T08-verify-hostile-zip-and-round-trip-journeys.md) | Verify hostile ZIP and round-trip journeys | 6 | Project Co-owner | ⬜ todo | Malicious ZIP/oversize/invalid format reject; E2E-005/006 return equivalent source trees and hashes |

### DoD

- [ ] Every task's acceptance and declared scope has actual evidence.
- [ ] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [ ] Permissions, persistence, privacy and real outputs are verified.
- [ ] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R2/R5/R11/R13/R14 → the stage's scoped contract, persistence, permission and review assertions; do not mark apparent functionality Done.

## Sprint S06: Trusted compilation and G1 release (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 124 h (ASSUMPTION A-03) | **Status:** ✅ DONE | **Owner:** Julio (proposed A-02)
**Goal:** Trusted compilation and G1 release for G1, using independently verified slices.

### Deliverables

1. `apps/jobs/src/compilation/worker.ts`
2. `apps/api/src/modules/compilations/routes.ts`
3. `apps/jobs/src/compilation/snapshot.ts`
4. `docs/adr/trusted-runtime-spike.md`
5. `apps/tex-executor/Dockerfile`
6. `apps/tex-executor/texmf.cnf`
7. `packages/contracts/src/executor.ts`
8. `apps/jobs/src/compilation/executor.ts`
9. `apps/jobs/src/compilation/trusted-worker-executor.ts`
10. `apps/tex-executor/src/execute.ts`
11. `apps/jobs/src/compilation/lifecycle.ts`
12. `apps/jobs/src/compilation/artifacts.ts`
13. `packages/latex/src/parse-log.ts`
14. `apps/web/src/features/pdf/pdf-viewer.tsx`
15. `apps/web/src/features/compilation/compile-controls.tsx`
16. `tests/integration/compiler-fixtures.test.ts`
17. `docs/operations/trusted-compilation.md`
18. `infra/railway/services.md`
19. `apps/web/vercel.json`
20. `docs/test-reports/g1-deploy.md`
21. `infra/scripts/trusted-backup.ts`
22. `docs/operations/g1-recovery.md`
23. `docs/test-reports/gate-g1-audit.md`
24. `docs/operations/g1-release.md`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S06-T01](../../implementation/sprint-06-trusted-compilation/S06-T01-create-durable-compile-queue-jobs.md) | Create durable compile queue jobs | 8 | Julio | ✅ done | Same Idempotency-Key creates one DB job; queue restarts recover status; quotas permit at most one active user/project compile |
| [S06-T02](../../implementation/sprint-06-trusted-compilation/S06-T02-freeze-compilation-source-revision.md) | Freeze compilation source revision | 8 | Julio | ✅ done | Job binds immutable revision and manifest hash before enqueue; concurrent source changes do not change inputs |
| [S06-T12](../../implementation/sprint-06-trusted-compilation/S06-T12-research-trusted-tex-runtime-and-image-limits.md) | Research trusted TeX runtime and image limits | 4 | Julio | ✅ done | Within 4h compile owned fixture, measure image/runtime needs and check fixed flags/resource controls; no public-isolation claim |
| [S06-T03](../../implementation/sprint-06-trusted-compilation/S06-T03-build-pinned-tex-live-image.md) | Build pinned TeX Live image | 8 | Julio | ✅ done | Pinned image compiles basic trusted article with latexmk and declares package/image manifest; contains no API/DB credentials |
| [S06-T04](../../implementation/sprint-06-trusted-compilation/S06-T04-define-compiler-executor-boundary.md) | Define compiler executor boundary | 6 | Julio | ✅ done | Typed CompilerExecutor separates trusted/public modes; unavailable public implementation fails closed as NOT_IMPLEMENTED |
| [S06-T13](../../implementation/sprint-06-trusted-compilation/S06-T13-implement-trusted-worker-executor-adapter.md) | Implement trusted worker executor adapter | 8 | Julio | ✅ done | CompilerExecutor sends frozen manifest to separate trusted runtime and maps typed results; never invokes TeX in API/collab |
| [S06-T05](../../implementation/sprint-06-trusted-compilation/S06-T05-enforce-trusted-compiler-execution-limits.md) | Enforce trusted compiler execution limits | 8 | Julio | ✅ done | Fixed argv/cwd and no-shell-escape; loop exceeds 60s and is killed; resources/input/output are finite and cleanup always runs |
| [S06-T14](../../implementation/sprint-06-trusted-compilation/S06-T14-implement-timeout-cancellation-and-job-recovery.md) | Implement timeout cancellation and job recovery | 8 | Julio | ✅ done | Finite timeout and cancel_requested are reconciled; queue crash retry preserves stable job ID and does not label running work cancelled early |
| [S06-T06](../../implementation/sprint-06-trusted-compilation/S06-T06-persist-verified-artifacts-and-job-result.md) | Persist verified artifacts and job result | 8 | Julio | ✅ done | Validated PDF/log/manifest stored privately; transactional job/artifact association survives retry without duplicate success |
| [S06-T07](../../implementation/sprint-06-trusted-compilation/S06-T07-parse-diagnostics-and-compile-failures.md) | Parse diagnostics and compile failures | 8 | Julio | ✅ done | File/line errors/warnings/missing refs/packages and timed_out versus failed statuses are typed and redact host paths |
| [S06-T08](../../implementation/sprint-06-trusted-compilation/S06-T08-create-real-pdf-viewer.md) | Create real PDF viewer | 8 | Julio | ✅ done | Parsed PDF has zoom/page/fit/download controls, expected text and revision label; previous success remains visibly old after failure |
| [S06-T09](../../implementation/sprint-06-trusted-compilation/S06-T09-connect-compile-controls-and-status-fallback.md) | Connect compile controls and status fallback | 6 | Julio | ✅ done | Compile submits real job, polls reliable status and permits editing; lost notification recovers through GET |
| [S06-T10](../../implementation/sprint-06-trusted-compilation/S06-T10-verify-genuine-compiler-fixtures.md) | Verify genuine compiler fixtures | 8 | Julio | ✅ done | Article/image/basic references produce parsed expected PDFs; syntax error yields diagnostic and retains old output |
| [S06-T11](../../implementation/sprint-06-trusted-compilation/S06-T11-document-trusted-execution-and-closed-public-mode.md) | Document trusted execution and closed public mode | 4 | Julio | ✅ done | Allowlist enforced; PUBLIC_SIGNUP_ENABLED and UNTRUSTED_COMPILE_ENABLED false; runbook states dedicated worker is not verified public isolation |
| [S06-T15](../../implementation/sprint-06-trusted-compilation/S06-T15-deploy-trusted-staging-slice-and-smoke.md) | Deploy trusted staging slice and smoke | 8 | Julio | ✅ done | Selected hosting or clean local deployment reproduces login/edit/compile/download with TLS where hosted; missing accounts remain explicit blocker |
| [S06-T16](../../implementation/sprint-06-trusted-compilation/S06-T16-verify-trusted-release-backup-and-rollback.md) | Verify trusted-release backup and rollback | 8 | Julio | ✅ done | Restore PG plus object manifests from a trusted sample and demonstrate rollback; no referenced blob is missing |
| [S06-T17](../../implementation/sprint-06-trusted-compilation/S06-T17-stabilize-and-review-g1-release.md) | Stabilize and review G1 release | 8 | Julio | ✅ done | All G1 Must assertions and quality gates pass with actual evidence; open later features remain NOT_STARTED; release checklist records both maintainers |

### DoD

- [x] Every task's acceptance and declared scope has actual evidence.
- [x] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [x] Permissions, persistence, privacy and real outputs are verified.
- [x] Contracts, progress, feature matrix and actual effort are updated.
- [x] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R1/R7/R12 → S06-T12/S06-T03/S06-T13 runtime research, pinned image and separate execution.
- R5 → S06-T16 backup/restore before release.

## Sprint S07: Durable collaboration (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 94 h (ASSUMPTION A-03) | **Status:** ✅ DONE | **Owner:** Project Co-owner (proposed A-02)
**Goal:** Durable collaboration for G2, using independently verified slices.

### Deliverables

1. `apps/collab/src/server.ts`
2. `apps/collab/src/auth/authenticate.ts`
3. `apps/api/src/modules/collab/ticket.ts`
4. `apps/collab/src/auth/ticket.ts`
5. `apps/web/src/features/collab/binding.ts`
6. `apps/web/src/features/collab/presence.tsx`
7. `apps/collab/src/persistence/update-log.ts`
8. `apps/collab/src/persistence/durable-ack.ts`
9. `apps/collab/src/persistence/snapshots.ts`
10. `apps/web/src/features/collab/offline.ts`
11. `apps/collab/src/tree-events.ts`
12. `apps/collab/src/redis.ts`
13. `tests/integration/collab-replicas.test.ts`
14. `apps/collab/src/auth/revocation.ts`
15. `apps/collab/src/metrics.ts`
16. `tests/integration/collab-recovery.test.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S07-T01](../../implementation/sprint-07-durable-collaboration/S07-T01-create-authenticated-hocuspocus-file-rooms.md) | Create authenticated Hocuspocus file rooms | 8 | Project Co-owner | ✅ done | Stable project/file ID room loads canonical Y.Doc and denies missing/foreign/expired identity before reading source |
| [S07-T02](../../implementation/sprint-07-durable-collaboration/S07-T02-implement-single-use-wss-tickets.md) | Implement single-use WSS tickets | 8 | Project Co-owner | ✅ done | 30s hashed ticket scopes session/project/file/action; reuse/wrong Origin/revoked membership fail atomically |
| [S07-T03](../../implementation/sprint-07-durable-collaboration/S07-T03-connect-collaborative-editor-presence-and-undo.md) | Connect collaborative editor presence and undo | 8 | Project Co-owner | ✅ done | Two clients see cursors/selections; user A undo leaves B edits intact; binding uses compatible pinned versions |
| [S07-T04](../../implementation/sprint-07-durable-collaboration/S07-T04-append-durable-crdt-updates.md) | Append durable CRDT updates | 8 | Project Co-owner | ✅ done | Postgres allocates per-file monotonic sequence under lock; duplicate/out-of-order Yjs updates converge after replay |
| [S07-T11](../../implementation/sprint-07-durable-collaboration/S07-T11-implement-commit-covered-durable-acknowledgements.md) | Implement commit-covered durable acknowledgements | 8 | Project Co-owner | ✅ done | ACK fileId/persistedSeq/stateVector covers committed changes only; frontend saved status waits for all pending local clocks |
| [S07-T12](../../implementation/sprint-07-durable-collaboration/S07-T12-compact-verified-crdt-snapshots-safely.md) | Compact verified CRDT snapshots safely | 8 | Project Co-owner | ✅ done | Snapshot upto_seq/hash verifies before update deletion; crash before/after compaction and multi-replica replay retain identical acknowledged content |
| [S07-T05](../../implementation/sprint-07-durable-collaboration/S07-T05-implement-offline-persistence-and-reconnect.md) | Implement offline persistence and reconnect | 8 | Project Co-owner | ✅ done | IndexedDB retains pending updates, new ticket used at reconnect, backoff avoids loop and saved label waits for durable coverage |
| [S07-T06](../../implementation/sprint-07-durable-collaboration/S07-T06-synchronize-tree-changes-with-open-rooms.md) | Synchronize tree changes with open rooms | 8 | Project Co-owner | ✅ done | Open-file rename retains room ID; delete rejects later writes and informs clients; missing event triggers REST tree refresh |
| [S07-T07](../../implementation/sprint-07-durable-collaboration/S07-T07-coordinate-two-collaboration-replicas.md) | Coordinate two collaboration replicas | 8 | Project Co-owner | ✅ done | Two servers with Redis/PG converge with clients crossing replicas; no sticky-session or local-volume assumption |
| [S07-T08](../../implementation/sprint-07-durable-collaboration/S07-T08-apply-live-role-and-session-revocation.md) | Apply live role and session revocation | 8 | Project Co-owner | ✅ done | Permissions invalidation prevents subsequent unauthorized mutation and new source delivery on open sockets; ticket identity cannot override current ACL |
| [S07-T09](../../implementation/sprint-07-durable-collaboration/S07-T09-instrument-collaborative-durability-metrics.md) | Instrument collaborative durability metrics | 6 | Project Co-owner | ✅ done | Connections and persistence lag measure separately from broadcast lag without logging manuscript content |
| [S07-T10](../../implementation/sprint-07-durable-collaboration/S07-T10-verify-convergence-failures-and-recovery.md) | Verify convergence failures and recovery | 8 | Project Co-owner | ✅ done | Five clients with 1000 edits each converge through reorder/disconnect/restart; zero durable-ACK loss; DB outage never reports saved |

### DoD

- [x] Every task's acceptance and declared scope has actual evidence.
- [x] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [x] Permissions, persistence, privacy and real outputs are verified.
- [x] Contracts, progress, feature matrix and actual effort are updated.
- [x] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R4/R6 → S07-T11/S07-T12/S07-T07 committed ACK, verified snapshots and multi-replica tests.

## Sprint S08: Sharing comments chat and G2 release (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 72 h (ASSUMPTION A-03) | **Status:** 🟡 IN_PROGRESS | **Owner:** Julio (proposed A-02)
**Goal:** Sharing comments chat and G2 release for G2, using independently verified slices.

### Deliverables

1. `apps/api/src/modules/sharing/invitations.ts`
2. `apps/api/src/modules/sharing/share-links.ts`
3. `apps/web/src/features/sharing/share-dialog.tsx`
4. `apps/api/src/modules/comments/routes.ts`
5. `apps/web/src/features/review/comment-thread.tsx`
6. `apps/web/src/features/review/comment-anchors.tsx`
7. `apps/api/src/modules/chat/routes.ts`
8. `apps/web/src/features/chat/project-chat.tsx`
9. `apps/api/src/modules/notifications/mentions.ts`
10. `apps/web/src/features/notifications/list.tsx`
11. `apps/api/src/modules/comments/safety.ts`
12. `apps/api/src/modules/chat/safety.ts`
13. `tests/security/sharing.test.ts`
14. `tests/e2e/comments.spec.ts`
15. `docs/test-reports/gate-g2-audit.md`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S08-T01](../../implementation/sprint-08-sharing-comments-chat/S08-T01-implement-expiring-email-invitations.md) | Implement expiring email invitations | 8 | Julio | ✅ done | OWNER invites allowed role; one-use accept/reject/revoke/expiry stay project-scoped and Mailpit captures local mail |
| [S08-T02](../../implementation/sprint-08-sharing-comments-chat/S08-T02-implement-bounded-hashed-share-links.md) | Implement bounded hashed share links | 8 | Julio | ✅ done | Create reveals token once; allowed role/expiry/maxUses/revocation validated server-side; revoked link denies next request |
| [S08-T03](../../implementation/sprint-08-sharing-comments-chat/S08-T03-create-sharing-and-role-management-ui.md) | Create sharing and role management UI | 8 | Julio | ✅ done | Owner sees pending invite/member/role/link state; non-owner cannot mutate rights via handcrafted requests |
| [S08-T04](../../implementation/sprint-08-sharing-comments-chat/S08-T04-implement-anchored-comments-and-replies.md) | Implement anchored comments and replies | 8 | Julio | ✅ done | Relative anchors plus context retain replies/resolve/reopen/mentions; deleted ranges become detached rather than move to unrelated text |
| [S08-T09](../../implementation/sprint-08-sharing-comments-chat/S08-T09-render-comment-anchor-and-reply-interactions.md) | Render comment anchor and reply interactions | 6 | Julio | ✅ done | Visible anchors/replies/mentions/resolve/reopen follow relative ranges; detached reason appears without moving comment to unrelated source |
| [S08-T05](../../implementation/sprint-08-sharing-comments-chat/S08-T05-create-authorized-durable-project-chat.md) | Create authorized durable project chat | 8 | Julio | ✅ done | Paginated messages persist and WSS invalidation refreshes authorized clients; missing notification recovers history |
| [S08-T06](../../implementation/sprint-08-sharing-comments-chat/S08-T06-create-mention-and-in-app-notifications.md) | Create mention and in-app notifications | 6 | Julio | ✅ done | Authorized mention recipients get one idempotent notification, can mark read, and see no foreign-project content |
| [S08-T07](../../implementation/sprint-08-sharing-comments-chat/S08-T07-enforce-comment-chat-safety-and-limits.md) | Enforce comment chat safety and limits | 6 | Julio | ✅ done | Role checks, size/rate limits and sanitized Markdown reject viewer writes/XSS/spam without stripping safe content |
| [S08-T08](../../implementation/sprint-08-sharing-comments-chat/S08-T08-verify-sharing-revocation-and-detached-anchors.md) | Verify sharing revocation and detached anchors | 6 | Julio | ✅ done | Expired invite, revoked link, wrong-project comment and viewer are rejected; reply/resolve and detached-range UI pass |
| [S08-T10](../../implementation/sprint-08-sharing-comments-chat/S08-T10-stabilize-and-review-g2-collaboration.md) | Stabilize and review G2 collaboration | 8 | Julio | 🔄 in_progress | G2 Must convergence/durability/revocation journeys pass with five clients and pending offline state visible |

### DoD

- [ ] Every task's acceptance and declared scope has actual evidence.
- [ ] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [ ] Permissions, persistence, privacy and real outputs are verified.
- [ ] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R2/R5/R11/R13/R14 → the stage's scoped contract, persistence, permission and review assertions; do not mark apparent functionality Done.

## Sprint S09: History review and project management (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 102 h (ASSUMPTION A-03) | **Status:** ⬜ NOT_STARTED | **Owner:** Project Co-owner (proposed A-02)
**Goal:** History review and project management for G3, using independently verified slices.

### Deliverables

1. `apps/api/src/modules/history/routes.ts`
2. `apps/web/src/features/history/timeline.tsx`
3. `packages/latex/src/diff.ts`
4. `apps/web/src/features/history/version-compare.tsx`
5. `apps/api/src/modules/history/restore.ts`
6. `apps/api/src/modules/review/suggestions.ts`
7. `apps/web/src/features/review/mode.tsx`
8. `apps/api/src/modules/review/resolve.ts`
9. `apps/web/src/features/review/suggestion-card.tsx`
10. `apps/api/src/modules/history/restore-metadata.ts`
11. `tests/integration/review-concurrency.test.ts`
12. `apps/web/src/features/history/restore-dialog.tsx`
13. `apps/api/src/modules/projects/lifecycle.ts`
14. `apps/web/src/features/projects/lifecycle.tsx`
15. `apps/api/src/modules/tags/routes.ts`
16. `apps/web/src/features/projects/tag-picker.tsx`
17. `apps/api/src/modules/projects/bulk.ts`
18. `apps/web/src/features/projects/bulk-actions.tsx`
19. `apps/api/src/modules/projects/ownership.ts`
20. `apps/jobs/src/exports/user-data.ts`
21. `apps/api/src/modules/account/delete-account.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S09-T01](../../implementation/sprint-09-history-review/S09-T01-create-immutable-labeled-history-queries.md) | Create immutable labeled history queries | 8 | Project Co-owner | ✅ done | Paginated consistent revisions show author/time/label and source manifest without mixing revisions |
| [S09-T02](../../implementation/sprint-09-history-review/S09-T02-compare-text-tree-and-binary-revisions.md) | Compare text tree and binary revisions | 8 | Project Co-owner | ✅ done | Text uses deterministic Myers/patience diff, structural changes by node ID and binary changes by hash |
| [S09-T03](../../implementation/sprint-09-history-review/S09-T03-restore-file-or-project-with-version-guard.md) | Restore file or project with version guard | 8 | Project Co-owner | ✅ done | Restore requires expectedRevision and creates a new immutable revision; stale source returns conflict and original history remains |
| [S09-T04](../../implementation/sprint-09-history-review/S09-T04-model-reviewer-suggestions-separately.md) | Model reviewer suggestions separately | 8 | Project Co-owner | ✅ done | REVIEWER creates insert/delete/replace proposal with anchors/base/hash while canonical text stays unchanged |
| [S09-T05](../../implementation/sprint-09-history-review/S09-T05-resolve-proposals-with-explicit-conflicts.md) | Resolve proposals with explicit conflicts | 8 | Project Co-owner | ✅ done | OWNER/EDITOR accept applies once only if expected context matches; changed range yields 409; reject does not alter source |
| [S09-T06](../../implementation/sprint-09-history-review/S09-T06-preserve-current-acl-and-historical-anchors-on-restore.md) | Preserve current ACL and historical anchors on restore | 6 | Project Co-owner | ✅ done | Content restore preserves current memberships/ownership/revocation and marks unresolvable anchors detached |
| [S09-T07](../../implementation/sprint-09-history-review/S09-T07-verify-concurrent-review-and-file-changes.md) | Verify concurrent review and file changes | 6 | Project Co-owner | ✅ done | Accept races, file rename/delete and stale anchors never double-apply or bypass reviewer restrictions |
| [S09-T08](../../implementation/sprint-09-history-review/S09-T08-create-explicit-restore-confirmation-ui.md) | Create explicit restore confirmation UI | 6 | Project Co-owner | ✅ done | Dialog shows affected file/tree/settings, permission and concurrency failures and new revision result |
| [S09-T09](../../implementation/sprint-09-history-review/S09-T09-implement-archive-trash-and-permanent-deletion.md) | Implement archive trash and permanent deletion | 8 | Project Co-owner | ✅ done | Archive/trash/restore remain distinct; owner confirmation starts reference-safe permanent deletion and export retention stays documented |
| [S09-T10](../../implementation/sprint-09-history-review/S09-T10-implement-owned-project-tags.md) | Implement owned project tags | 6 | Project Co-owner | ✅ done | Unique per-user colored tags link many projects and filter pagination without exposing another user's private tag set |
| [S09-T11](../../implementation/sprint-09-history-review/S09-T11-implement-permission-aware-bulk-project-actions.md) | Implement permission-aware bulk project actions | 6 | Project Co-owner | ✅ done | Bulk archive/tag reports success/error per project and checks each ACL; one forbidden project never grants or hides cross-project changes |
| [S09-T12](../../implementation/sprint-09-history-review/S09-T12-implement-explicit-ownership-transfer.md) | Implement explicit ownership transfer | 8 | Project Co-owner | ✅ done | Recipient accepts scoped expiring offer; transaction changes owner atomically and failure retains previous owner; sole owner cannot abandon |
| [S09-T13](../../implementation/sprint-09-history-review/S09-T13-export-authorized-user-data.md) | Export authorized user data | 8 | Project Co-owner | ✅ done | Account export contains only authorized data with private expiring access; shared-project membership is described without leaking other users' secrets |
| [S09-T14](../../implementation/sprint-09-history-review/S09-T14-delete-account-under-shared-ownership-rules.md) | Delete account under shared ownership rules | 8 | Project Co-owner | ✅ done | Owner must transfer/delete sole-owned projects before deletion; sessions/tokens revoked and source/audit retention follows stated policy |

### DoD

- [x] Every task's acceptance and declared scope has actual evidence.
- [x] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [x] Permissions, persistence, privacy and real outputs are verified.
- [x] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R2/R5/R11/R13/R14 → the stage's scoped contract, persistence, permission and review assertions; do not mark apparent functionality Done.

## Sprint S10: Academic editing bibliography and SyncTeX (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 104 h (ASSUMPTION A-03) | **Status:** ⬜ NOT_STARTED | **Owner:** Julio (proposed A-02)
**Goal:** Academic editing bibliography and SyncTeX for G3, using independently verified slices.

### Deliverables

1. `apps/tex-executor/src/profiles.ts`
2. `apps/tex-executor/src/bibliography.ts`
3. `packages/editor/src/citations.ts`
4. `packages/latex/src/bib.ts`
5. `apps/web/src/features/references/search.tsx`
6. `apps/api/src/modules/synctex/routes.ts`
7. `apps/web/src/features/pdf/source-navigation.ts`
8. `packages/editor/src/snippets.ts`
9. `packages/editor/src/completion.ts`
10. `packages/latex/src/word-count.ts`
11. `apps/api/src/modules/projects/statistics.ts`
12. `apps/api/src/modules/search/routes.ts`
13. `apps/web/src/features/search/project-search.tsx`
14. `apps/web/src/features/editor/preferences.tsx`
15. `packages/editor/src/symbols.ts`
16. `packages/editor/src/spellcheck.ts`
17. `apps/web/src/features/help/latex-help.tsx`
18. `tests/e2e/academic-editor.spec.ts`
19. `apps/web/src/features/compilation/auto-compile.ts`
20. `apps/jobs/src/compilation/coalesce.ts`
21. `apps/jobs/src/compilation/cache.ts`
22. `apps/jobs/src/compilation/clean.ts`
23. `apps/jobs/src/maintenance/artifacts.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S10-T01](../../implementation/sprint-10-academic-editing/S10-T01-add-tested-alternative-tex-profiles.md) | Add tested alternative TeX profiles | 8 | Julio | ✅ done | XeLaTeX/LuaLaTeX/compatible DVI route each has parsed output fixture and fixed allowlisted argv |
| [S10-T02](../../implementation/sprint-10-academic-editing/S10-T02-compile-bibliography-and-complete-citations.md) | Compile bibliography and complete citations | 8 | Julio | ✅ done | BibTeX/Biber multipass fixtures contain expected citations/bibliography; citation completion inserts selected key |
| [S10-T03](../../implementation/sprint-10-academic-editing/S10-T03-index-bibtex-and-search-local-references.md) | Index BibTeX and search local references | 8 | Julio | ✅ done | Duplicate keys reported; key/title/author/DOI/year queries work without changing source on open |
| [S10-T04](../../implementation/sprint-10-academic-editing/S10-T04-implement-forward-inverse-synctex.md) | Implement forward inverse SyncTeX | 8 | Julio | ✅ done | Authorized frozen artifacts map known source point/PDF point within documented tolerance and reject invalid file/page |
| [S10-T05](../../implementation/sprint-10-academic-editing/S10-T05-create-valid-academic-insertion-snippets.md) | Create valid academic insertion snippets | 6 | Julio | ✅ done | Figure/table/equation/section/label/list/link/reference/citation fixtures compile and only selected region changes |
| [S10-T06](../../implementation/sprint-10-academic-editing/S10-T06-complete-environments-labels-and-file-paths.md) | Complete environments labels and file paths | 8 | Julio | ✅ done | Begin/end pairs, indentation, labels/input/images and nested completion contexts work on declared fixtures |
| [S10-T07](../../implementation/sprint-10-academic-editing/S10-T07-report-documented-project-statistics.md) | Report documented project statistics | 6 | Julio | ✅ done | Approximate words, bytes, files and last compile match fixture expectations with documented parser limits |
| [S10-T08](../../implementation/sprint-10-academic-editing/S10-T08-implement-project-search-and-previewed-replacement.md) | Implement project search and previewed replacement | 8 | Julio | ✅ done | Authorized file/project searches show locations and safe regex limits; stale replace preview cannot overwrite concurrent changes |
| [S10-T09](../../implementation/sprint-10-academic-editing/S10-T09-persist-editor-preferences-symbols-and-layout.md) | Persist editor preferences symbols and layout | 8 | Julio | ✅ done | Theme/font/tab/wrap/symbol search/layout survive reload; supported shortcuts preserve focus and accessibility |
| [S10-T11](../../implementation/sprint-10-academic-editing/S10-T11-add-local-spell-checking-and-static-error-help.md) | Add local spell checking and static error help | 6 | Julio | ✅ done | Local dictionary ignores commands and markup; static help works offline and sends no text to external service |
| [S10-T10](../../implementation/sprint-10-academic-editing/S10-T10-verify-bibliography-pdf-synctex-and-keymaps.md) | Verify bibliography PDF SyncTeX and keymaps | 8 | Julio | ✅ done | Real engine/citation/source-PDF/keyboard fixtures pass; unsupported profiles are visibly unavailable |
| [S10-T12](../../implementation/sprint-10-academic-editing/S10-T12-add-debounced-automatic-compilation.md) | Add debounced automatic compilation | 8 | Julio | ✅ done | Configured debounce creates at most one queued successor; active persisted job is not killed by each keystroke |
| [S10-T13](../../implementation/sprint-10-academic-editing/S10-T13-implement-authorized-content-aware-compiler-cache.md) | Implement authorized content-aware compiler cache | 8 | Julio | ✅ done | Manifest/engine/image/options/policy changes invalidate key; cache hit cannot authorize another project's artifacts |
| [S10-T14](../../implementation/sprint-10-academic-editing/S10-T14-implement-clean-rebuild-and-retention-cleanup.md) | Implement clean rebuild and retention cleanup | 6 | Julio | ✅ done | ForceClean invalidates auxiliaries; fixture comparison is documented; expired unreferenced artifacts clear idempotently while source persists |

### DoD

- [x] Every task's acceptance and declared scope has actual evidence.
- [x] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [x] Permissions, persistence, privacy and real outputs are verified.
- [x] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R2/R5/R11/R13/R14 → the stage's scoped contract, persistence, permission and review assertions; do not mark apparent functionality Done.

## Sprint S11: Conservative visual editor and G3 release (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 80 h (ASSUMPTION A-03) | **Status:** 🟨 IN_PROGRESS | **Owner:** Project Co-owner (proposed A-02)
**Goal:** Conservative visual editor and G3 release for G3, using independently verified slices.

### Deliverables

1. `docs/adr/008-visual-parser.md`
2. `packages/latex/src/visual-ast.ts`
3. `apps/web/src/features/visual/basic-nodes.tsx`
4. `packages/editor/src/visual-patch.ts`
5. `apps/web/src/features/visual/academic-nodes.tsx`
6. `packages/editor/src/visual-academic-patch.ts`
7. `apps/web/src/features/visual/fallback-node.tsx`
8. `apps/web/src/features/visual/mode-switch.tsx`
9. `tests/integration/visual-round-trip.test.ts`
10. `tests/e2e/mixed-editing.spec.ts`
11. `docs/test-reports/gate-g3-audit.md`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S11-T01](../../implementation/sprint-11-visual-editor/S11-T01-research-conservative-visual-parser.md) | Research conservative visual parser | 4 | Project Co-owner | ✅ done | Within 4h spike, evaluate parser/license/range fidelity against representative unknown macros and record supported subset or blocked outcome |
| [S11-T02](../../implementation/sprint-11-visual-editor/S11-T02-create-source-ast-projection-and-range-map.md) | Create source AST projection and range map | 8 | Project Co-owner | ✅ done | Supported nodes retain exact source ranges/escaping and parser failure returns controlled code-mode fallback |
| [S11-T03](../../implementation/sprint-11-visual-editor/S11-T03-render-basic-supported-visual-nodes.md) | Render basic supported visual nodes | 8 | Project Co-owner | ✅ done | Headings/paragraphs/bold/italic/lists render as supported projection with significant spaces/comments preserved |
| [S11-T04](../../implementation/sprint-11-visual-editor/S11-T04-apply-minimal-version-checked-source-patches.md) | Apply minimal version-checked source patches | 8 | Project Co-owner | ✅ done | Patch changes only expected Y.Text region; stale concurrent region reparse/conflict prevents silent overwrite |
| [S11-T05](../../implementation/sprint-11-visual-editor/S11-T05-render-supported-math-figures-tables-and-cites.md) | Render supported math figures tables and cites | 8 | Project Co-owner | ✅ done | Only declared simple nodes edit; previews use authorized assets and compatible math while compiled PDF remains final rendering |
| [S11-T10](../../implementation/sprint-11-visual-editor/S11-T10-complete-simple-table-and-formula-editing-slices.md) | Complete simple table and formula editing slices | 8 | Project Co-owner | ✅ done | Simple supported table/math edits modify their region only; unsupported nesting goes literal and conflict preserves old source |
| [S11-T06](../../implementation/sprint-11-visual-editor/S11-T06-create-literal-fallback-for-unsupported-tex.md) | Create literal fallback for unsupported TeX | 6 | Project Co-owner | ✅ done | Unknown macros/verbatim/TikZ/preamble/redefinitions stay literal and cannot be destructively rewritten |
| [S11-T07](../../implementation/sprint-11-visual-editor/S11-T07-make-code-visual-switching-read-only.md) | Make code visual switching read-only | 6 | Project Co-owner | ✅ done | Opening visual and returning to code without edit leaves source bytes/hash unchanged, including parser errors |
| [S11-T08](../../implementation/sprint-11-visual-editor/S11-T08-verify-100-non-destructive-round-trip-fixtures.md) | Verify 100 non-destructive round-trip fixtures | 8 | Project Co-owner | ✅ done | All 100 original/permitted fixtures are byte-identical without edit; edited supported region is the only changed region |
| [S11-T09](../../implementation/sprint-11-visual-editor/S11-T09-verify-mixed-code-visual-coediting.md) | Verify mixed code visual coediting | 8 | Project Co-owner | ✅ done | Two clients on supported region converge; incompatible simultaneous changes surface conflict and preserve source |
| [S11-T11](../../implementation/sprint-11-visual-editor/S11-T11-stabilize-and-review-g3-academic-workflow.md) | Stabilize and review G3 academic workflow | 8 | Project Co-owner | ✅ done | History/restore/review/bibliography/SyncTeX tests plus 100 round trips pass; later provider claims remain explicit |

### DoD

- [ ] Every task's acceptance and declared scope has actual evidence.
- [ ] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [ ] Permissions, persistence, privacy and real outputs are verified.
- [ ] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R3 → S11-T01/S11-T08 parser spike and 100 byte-preserving fixtures.

## Sprint S12: GitHub and versioned exports (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 62 h (ASSUMPTION A-03) | **Status:** 🟨 IN_PROGRESS | **Owner:** Julio (proposed A-02)
**Goal:** GitHub and versioned exports for G4, using independently verified slices.

### Deliverables

1. `apps/api/src/modules/integrations/github-auth.ts`
2. `apps/api/src/modules/integrations/github-link.ts`
3. `apps/jobs/src/sync/github-pull.ts`
4. `apps/jobs/src/sync/apply-changes.ts`
5. `apps/jobs/src/sync/github-push.ts`
6. `apps/web/src/features/integrations/github-sync.tsx`
7. `apps/api/src/modules/exports/routes.ts`
8. `tests/integration/github-sync.test.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S12-T01](../../implementation/sprint-12-github-sync/S12-T01-implement-github-oauth-credential-handling.md) | Implement GitHub OAuth credential handling | 8 | Julio | ✅ done | PKCE/state/replay/revocation and encrypted server-held tokens pass; browser/logs contain no provider token |
| [S12-T02](../../implementation/sprint-12-github-sync/S12-T02-link-authorized-repository-and-branch.md) | Link authorized repository and branch | 8 | Julio | ✅ done | Explicit import-new versus pair-existing compares manifests and records remote ref without destructive initial merge |
| [S12-T03](../../implementation/sprint-12-github-sync/S12-T03-pull-using-checkpoint-and-base-sha.md) | Pull using checkpoint and base SHA | 8 | Julio | ✅ done | Pull validates paths and base, snapshots local state and surfaces concurrent local/remote/binary conflicts |
| [S12-T08](../../implementation/sprint-12-github-sync/S12-T08-apply-remote-changes-through-live-canonical-service.md) | Apply remote changes through live canonical service | 8 | Julio | ✅ done | Pull mutation is authorized through canonical text service, emits invalidations, preserves metadata and reports detached anchors |
| [S12-T04](../../implementation/sprint-12-github-sync/S12-T04-push-frozen-revision-with-remote-guard.md) | Push frozen revision with remote guard | 8 | Julio | ✅ done | Push uses sourceRevision and expectedRemoteSHA; remote branch change yields conflict and no automatic force push |
| [S12-T05](../../implementation/sprint-12-github-sync/S12-T05-create-sync-status-diff-and-resolution-ui.md) | Create sync status diff and resolution UI | 8 | Julio | ✅ done | Users see local/remote/base changes and resolve keep-local/keep-remote/manual without claiming pending action synced |
| [S12-T06](../../implementation/sprint-12-github-sync/S12-T06-export-authorized-revision-artifacts-and-links.md) | Export authorized revision artifacts and links | 6 | Julio | 🔄 in_progress | ZIP/PDF/log download and expiring read links select one immutable authorized revision with private access checks |
| [S12-T07](../../implementation/sprint-12-github-sync/S12-T07-verify-github-failure-concurrency-cases.md) | Verify GitHub failure concurrency cases | 8 | Julio | ✅ done | Credentialed test repo proves push/pull; expired token/non-fast-forward/edit-during-sync never overwrite silently |

### DoD

- [ ] Every task's acceptance and declared scope has actual evidence.
- [ ] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [ ] Permissions, persistence, privacy and real outputs are verified.
- [ ] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R9/R10 → provider/Git research and explicit checkpoint/base/conflict tests in this stage.

## Sprint S13: Optional reference and Dropbox providers (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 58 h (ASSUMPTION A-03) | **Status:** 🔄 IN_PROGRESS | **Owner:** Project Co-owner (proposed A-02)
**Goal:** Optional reference and Dropbox providers for G4, using independently verified slices.

### Deliverables

1. `packages/contracts/src/provider.ts`
2. `apps/api/src/modules/integrations/connections.ts`
3. `apps/jobs/src/sync/zotero.ts`
4. `apps/web/src/features/references/zotero.tsx`
5. `docs/adr/009-reference-providers.md`
6. `apps/jobs/src/sync/optional-reference-provider.ts`
7. `apps/jobs/src/sync/dropbox.ts`
8. `apps/jobs/src/sync/dropbox-bidirectional.ts`
9. `apps/api/src/modules/references/import.ts`
10. `tests/integration/provider-contracts.test.ts`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S13-T01](../../implementation/sprint-13-reference-providers/S13-T01-define-provider-adapter-and-connection-lifecycle.md) | Define provider adapter and connection lifecycle | 8 | Project Co-owner | ✅ done | Typed capability/error model handles connect/disconnect/refresh/revoke and keeps user connection separate from project permission |
| [S13-T02](../../implementation/sprint-13-reference-providers/S13-T02-import-and-refresh-authorized-zotero-library.md) | Import and refresh authorized Zotero library | 8 | Project Co-owner | ✅ done | Credentialed capability check permits library import; read-only linked .bib refresh uses diff and protects local edits |
| [S13-T03](../../implementation/sprint-13-reference-providers/S13-T03-research-mendeley-papers-access-and-terms.md) | Research Mendeley Papers access and terms | 4 | Project Co-owner | ✅ done | Within 4h check permitted current APIs/plans and produce capability matrix; no access means BLOCKED_BY_PROVIDER, not fabricated adapter success |
| [S13-T07](../../implementation/sprint-13-reference-providers/S13-T07-implement-one-permitted-optional-bibliography-provider.md) | Implement one permitted optional bibliography provider | 8 | Project Co-owner | ✅ done | Only capabilities validated by provider spike are implemented and credential-tested; absent access leaves task blocked and no claimed Mendeley/Papers parity |
| [S13-T04](../../implementation/sprint-13-reference-providers/S13-T04-implement-authorized-manual-dropbox-export.md) | Implement authorized manual Dropbox export | 8 | Project Co-owner | ✅ done | Credentialed manual export publishes frozen authorized source and reports provider/revocation errors; bidirectional synchronization is S13-T08 |
| [S13-T08](../../implementation/sprint-13-reference-providers/S13-T08-add-optional-bidirectional-dropbox-synchronization.md) | Add optional bidirectional Dropbox synchronization | 8 | Project Co-owner | ✅ done | Only permitted capabilities use explicit checkpoint/base compare; simultaneous local/remote edit yields visible conflict and audit |
| [S13-T05](../../implementation/sprint-13-reference-providers/S13-T05-import-editable-individual-references.md) | Import editable individual references | 6 | Project Co-owner | ✅ done | Only provider-permitted entries become editable local .bib; safe import preserves source and does not silently normalize |
| [S13-T06](../../implementation/sprint-13-reference-providers/S13-T06-verify-provider-contract-and-real-connectivity.md) | Verify provider contract and real connectivity | 8 | Project Co-owner | ✅ done | Deterministic fixtures test errors; credentialed staging results separately identify supported/blocked providers with no fake DONE |

### DoD

- [ ] Every task's acceptance and declared scope has actual evidence.
- [ ] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [ ] Permissions, persistence, privacy and real outputs are verified.
- [ ] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R9/R10 → provider/Git research and explicit checkpoint/base/conflict tests in this stage.

## Sprint S14: Git HTTP optional features and G4 release (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 90 h (ASSUMPTION A-03) | **Status:** 🟨 IN_PROGRESS | **Owner:** Julio (proposed A-02)
**Goal:** Git HTTP optional features and G4 release for G4, using independently verified slices.

### Deliverables

1. `docs/adr/010-git-http.md`
2. `apps/git-bridge/src/server.ts`
3. `apps/git-bridge/src/auth.ts`
4. `apps/git-bridge/src/protocol.ts`
5. `apps/git-bridge/src/import.ts`
6. `apps/jobs/src/notifications/email.ts`
7. `apps/web/src/features/notifications/preferences.tsx`
8. `packages/contracts/src/writing-assistant.ts`
9. `apps/api/src/modules/assistance/routes.ts`
10. `apps/api/src/modules/auth/oauth.ts`
11. `apps/api/src/modules/auth/mfa.ts`
12. `apps/tex-executor/package-manifest.json`
13. `tests/integration/special-packages.test.ts`
14. `apps/jobs/src/imports/remote-resource.ts`
15. `apps/api/src/modules/auth/totp.ts`
16. `tests/integration/git-cli.test.ts`
17. `docs/test-reports/gate-g4-audit.md`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S14-T01](../../implementation/sprint-14-git-and-optional-features/S14-T01-research-git-http-implementation-and-mapping.md) | Research Git HTTP implementation and mapping | 4 | Julio | ✅ done | Within 4h choose licensed compatible engine and revision-to-commit mapping or record blocked capability |
| [S14-T02](../../implementation/sprint-14-git-and-optional-features/S14-T02-create-authenticated-git-bridge-service.md) | Create authenticated Git bridge service | 8 | Julio | ✅ done | Revocable scoped token authorizes protocol endpoint without DB/API session secrets in exposed response |
| [S14-T03](../../implementation/sprint-14-git-and-optional-features/S14-T03-implement-actual-clone-fetch-and-push.md) | Implement actual clone fetch and push | 8 | Julio | ✅ done | Real CLI clone/fetch/push operates on frozen commits and rejects stale non-fast-forward push |
| [S14-T04](../../implementation/sprint-14-git-and-optional-features/S14-T04-apply-git-imports-through-canonical-mutation-service.md) | Apply Git imports through canonical mutation service | 8 | Julio | ✅ done | Imported tree/text updates enter authorized Yjs mutations, create revision, preserve metadata and report detached anchors |
| [S14-T05](../../implementation/sprint-14-git-and-optional-features/S14-T05-deliver-preference-controlled-email-notifications.md) | Deliver preference-controlled email notifications | 8 | Julio | ✅ done | Mentions/invites/replies respect preferences and current permissions; replay sends once with Mailpit and credentialed staging separately |
| [S14-T06](../../implementation/sprint-14-git-and-optional-features/S14-T06-add-optional-private-writing-assistance.md) | Add optional private writing assistance | 8 | Julio | ✅ done | Without user/project opt-in no text is sent; selected fragment only, bounded quota, disconnect and provider-error fallback preserve editor use |
| [S14-T07](../../implementation/sprint-14-git-and-optional-features/S14-T07-implement-safe-social-oauth-account-linking.md) | Implement safe social OAuth account linking | 8 | Julio | ✅ done | Authorized Google/GitHub identity link/unlink checks state/PKCE and protects existing account association; optional TOTP challenge is S14-T11 |
| [S14-T09](../../implementation/sprint-14-git-and-optional-features/S14-T09-profile-additional-compiler-packages-and-fonts.md) | Profile additional compiler packages and fonts | 6 | Julio | ✅ done | Every added class/font/package has license/source manifest and a real fixture; network package install per request remains disabled |
| [S14-T10](../../implementation/sprint-14-git-and-optional-features/S14-T10-implement-ssrf-safe-permitted-remote-resource-import.md) | Implement SSRF-safe permitted remote resource import | 8 | Julio | ✅ done | Allowlisted source, DNS revalidation, private-range/redirect/type/size/time controls reject metadata/internal fetch and import valid authorized object |
| [S14-T11](../../implementation/sprint-14-git-and-optional-features/S14-T11-implement-optional-totp-challenge-and-recovery-slice.md) | Implement optional TOTP challenge and recovery slice | 8 | Julio | ✅ done | Opt-in MFA uses verified setup and one-use recovery; disabling MFA requires authenticated challenge and revokes affected sessions |
| [S14-T08](../../implementation/sprint-14-git-and-optional-features/S14-T08-verify-real-git-protocol-and-token-revocation.md) | Verify real Git protocol and token revocation | 8 | Julio | ✅ done | CLI clone/commit/push/pull, Unicode/binary, repeated sync and expired/revoked token cases pass |
| [S14-T12](../../implementation/sprint-14-git-and-optional-features/S14-T12-stabilize-and-review-supported-g4-integrations.md) | Stabilize and review supported G4 integrations | 8 | Julio | ✅ done | Supported providers pass credentialed sync/conflict/revocation and real Git CLI checks; unavailable capabilities retained as blocked/deferred |

### DoD

- [ ] Every task's acceptance and declared scope has actual evidence.
- [ ] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [ ] Permissions, persistence, privacy and real outputs are verified.
- [ ] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R9/R10 → provider/Git research and explicit checkpoint/base/conflict tests in this stage.

## Sprint S15: Public isolation scale and G5 release (weeks not scheduled)

**Duration:** No fixed timebox | **Effort:** 100 h (ASSUMPTION A-03) | **Status:** ⬜ NOT_STARTED | **Owner:** Project Co-owner (proposed A-02)
**Goal:** Public isolation scale and G5 release for G5, using independently verified slices.

### Deliverables

1. `docs/adr/011-public-executor.md`
2. `infra/policies/public-executor.md`
3. `apps/jobs/src/compilation/isolated-executor.ts`
4. `infra/policies/isolation-deployment.md`
5. `tests/security/executor-isolation.test.ts`
6. `apps/jobs/src/compilation/public-policy.ts`
7. `infra/railway/replicas.md`
8. `tests/integration/replica-failover.test.ts`
9. `tests/load/workspace.js`
10. `docs/test-reports/load-baseline.md`
11. `infra/scripts/backup-restore.ts`
12. `tests/integration/disaster-recovery.test.ts`
13. `infra/railway/observability.md`
14. `apps/api/src/plugins/telemetry.ts`
15. `tests/security/public-audit.test.ts`
16. `apps/api/src/modules/admin/routes.ts`
17. `apps/web/src/features/admin/dashboard.tsx`
18. `tests/e2e/release-accessibility.spec.ts`
19. `docs/operations/runbooks.md`
20. `docs/test-reports/feature-parity-audit.md`
21. `docs/test-reports/gate-g5-audit.md`
22. `docs/operations/public-release.md`
23. `docs/test-reports/public-release-approval.md`

| ID | Description | Effort (h) | Assignee | Status | Acceptance criteria |
|---|---|---|---|---|---|
| [S15-T01](../../implementation/sprint-15-public-hardening/S15-T01-research-verified-public-isolation-primitives.md) | Research verified public isolation primitives | 4 | Project Co-owner | ✅ done | Within 4h document actual provider network/mount/process/resource controls and adversarial test design or block G5 |
| [S15-T13](../../implementation/sprint-15-public-hardening/S15-T13-provision-verified-isolated-executor-adapter.md) | Provision verified isolated executor adapter | 8 | Project Co-owner | ✅ done | Runtime implements measured filesystem/network/process/resource isolation with no inherited secrets and returns bounded artifacts by contract |
| [S15-T02](../../implementation/sprint-15-public-hardening/S15-T02-audit-tex-escape-and-resource-attacks.md) | Audit TeX escape and resource attacks | 8 | Project Co-owner | ✅ done | Verified public runner rejects host/other-job/secret reads and network/process escapes; loops/time/memory/disk limits kill job while service stays healthy |
| [S15-T03](../../implementation/sprint-15-public-hardening/S15-T03-route-public-mode-through-verified-executor.md) | Route public mode through verified executor | 6 | Project Co-owner | ✅ done | Enabling untrusted mode without verified executor fails startup; policy/version flags enforce the audited runtime only |
| [S15-T04](../../implementation/sprint-15-public-hardening/S15-T04-verify-multi-replica-api-and-collab-deployment.md) | Verify multi-replica API and collab deployment | 8 | Project Co-owner | ✅ done | Different replicas reconnect and converge without affinity or volumes; graceful shutdown retains acknowledged changes |
| [S15-T05](../../implementation/sprint-15-public-hardening/S15-T05-measure-rest-ws-and-compile-load.md) | Measure REST WS and compile load | 8 | Project Co-owner | ✅ done | Publish p50/p95/p99 at 10/50/100 connection stages with recorded hardware; CRUD <=500ms and declared capacities are measured |
| [S15-T06](../../implementation/sprint-15-public-hardening/S15-T06-automate-complete-backup-and-restore.md) | Automate complete backup and restore | 8 | Project Co-owner | ✅ done | Restore DB plus objects and key instructions; every referenced manifest/blob hash resolves and sessions/policies remain coherent |
| [S15-T07](../../implementation/sprint-15-public-hardening/S15-T07-create-privacy-preserving-telemetry-and-alerts.md) | Create privacy-preserving telemetry and alerts | 8 | Project Co-owner | ✅ done | Trace/request IDs cross API/jobs; privacy scan finds zero manuscript/token leakage; lag/queue/backup alerts have reproducible triggers |
| [S15-T08](../../implementation/sprint-15-public-hardening/S15-T08-audit-delivered-api-wss-files-and-integrations.md) | Audit delivered API WSS files and integrations | 8 | Project Co-owner | ✅ done | IDOR/XSS/CSRF/SSRF/ticket/ZIP/provider cases pass and no unresolved critical audit finding remains |
| [S15-T09](../../implementation/sprint-15-public-hardening/S15-T09-enforce-abuse-quotas-flags-and-admin-permissions.md) | Enforce abuse quotas flags and admin permissions | 8 | Project Co-owner | ✅ done | Only explicit admin controls users/jobs/quotas/flags; anonymous abuse returns bounded failures and compiler concurrency stays finite |
| [S15-T10](../../implementation/sprint-15-public-hardening/S15-T10-review-accessibility-browsers-and-operating-docs.md) | Review accessibility browsers and operating docs | 8 | Project Co-owner | ✅ done | Current-gate workflows pass recorded Chrome/Firefox/Edge versions, manual keyboard checklist and operational restore/rollback walkthrough |
| [S15-T11](../../implementation/sprint-15-public-hardening/S15-T11-audit-every-feature-id-and-claim.md) | Audit every feature ID and claim | 6 | Project Co-owner | ✅ done | Every requirement has real implementation/test evidence or explicit unmet/deferred/blocked status; no apparent UI-only DONE |
| [S15-T14](../../implementation/sprint-15-public-hardening/S15-T14-stabilize-public-candidate-and-review-release-evidence.md) | Stabilize public candidate and review release evidence | 8 | Project Co-owner | ✅ done | Security/restore/load/accessibility audit records actual outputs and rollback; all G5 Musts meet gates before public approval task |
| [S15-T12](../../implementation/sprint-15-public-hardening/S15-T12-approve-and-enable-optional-public-signup.md) | Approve and enable optional public signup | 4 | Project Co-owner | ✅ done | Both maintainers review verified isolation/security/account rules before flag change; otherwise flags remain false and task blocked |

### DoD

- [ ] Every task's acceptance and declared scope has actual evidence.
- [ ] QG-01–QG-10 from [Quality Gates](06-ci-cd-and-environments.md) pass where applicable; critical coverage >=80%.
- [ ] Permissions, persistence, privacy and real outputs are verified.
- [ ] Contracts, progress, feature matrix and actual effort are updated.
- [ ] The corresponding release-gate stabilization/audit is complete before declaring that gate passed.

### Mitigations

- R1/R5/R13 → S15-T01/S15-T13/S15-T02/S15-T06/S15-T08 verified isolation, restore and security audit.

## Effort Reconciliation and Capacity

| Component | Person-hours | Basis |
|---|---|---|
| S00 | 66 | Sum of task/sub-task hours; provisional |
| S01 | 72 | Sum of task/sub-task hours; provisional |
| S02 | 78 | Sum of task/sub-task hours; provisional |
| S03 | 66 | Sum of task/sub-task hours; provisional |
| S04 | 72 | Sum of task/sub-task hours; provisional |
| S05 | 88 | Sum of task/sub-task hours; provisional |
| S06 | 124 | Sum of task/sub-task hours; provisional |
| S07 | 94 | Sum of task/sub-task hours; provisional |
| S08 | 72 | Sum of task/sub-task hours; provisional |
| S09 | 102 | Sum of task/sub-task hours; provisional |
| S10 | 104 | Sum of task/sub-task hours; provisional |
| S11 | 80 | Sum of task/sub-task hours; provisional |
| S12 | 62 | Sum of task/sub-task hours; provisional |
| S13 | 58 | Sum of task/sub-task hours; provisional |
| S14 | 90 | Sum of task/sub-task hours; provisional |
| S15 | 100 | Sum of task/sub-task hours; provisional |
| Planned task effort | 1328 | Includes per-task tests and documentation and explicit stabilization tasks |
| Uncertainty allowance (15%) | 200 | ASSUMPTION A-04; unscheduled reserve, not an implementation task |
| Documentation/validation outside tasks | 0 | Already included; avoid double counting |
| Advisor meetings | 0 | No advisor requirement supplied |
| Total reference effort | 1528 | Planning estimate, not a delivery commitment |

G1 reference: 566 h task effort + 85 h reserve = 651 h. These are estimates for learning and decomposition; no hours/week, duration, or completion date follows. Capacity-versus-calendar reconciliation is **NOT_APPLICABLE for an unscheduled project**; actual availability is recorded when work starts. If the team later chooses a timebox, compare hours to actual contributor capacity and cut optional scope first.

## Dependency Path

```text
G1: S00 -> S01 -> S02 -> S03 -> S04 -> S05 -> S06
G2: S06 -> S07 -> S08
G3: S08 -> S09 -> S10 -> S11
G4: S11 -> S12 -> S13 -> S14
G5: S14 -> S15 (optional public operation)
```

This is the conservative release sequence. Original prerequisite edges (S04→S07, S02→S08, S06→S10, S07→S11, S09→S12, S12→S13/S14 and S06/S07/S11/S14→S15) remain satisfied transitively. The source allowed overlap; two contributors may relax the additional release-sequence edges after stable-contract review. No calendar slack or numerical longest-path claim is made without a chosen schedule. The YAML depends_on DAG is authoritative for taking a task.

## Cuts and Stabilization Windows

Trigger review when actual effort is >150% of likely estimate or a blocker lasts two consecutive work sessions. Re-estimate and split before compressing work. Ordered lowest-to-highest impact cuts: (1) third-party AI/commercial providers; (2) bidirectional Dropbox/URL import/special TeX packages; (3) Git HTTP and optional OAuth/MFA; (4) advanced visual node breadth; (5) bulk actions/statistics/layout extras; (6) postpone public operation entirely. Preserve each deferred ID. Never cut ACL, durable ACK, real compilation, immutable source attribution or privacy.

S06-T17, S08-T10, S11-T11, S14-T12 and S15-T14 reserve 8h stabilization tasks for G1–G5 respectively. They begin after the relevant feature work and may create additional <=8 h bug-fix tasks if findings remain; a window estimate is not permission to skip unresolved failures. G4 closes only for declared supported providers with explicit exclusions. Contract stubs may unblock isolated development but remain flagged unavailable in product until real integration replaces them. The S13/S14 main integration review records [GAP-40](../progress/open-gaps.md); G4 release remains pending credentialed staging and independent approval.

## Technical Debt Backlog

[Technical Debt](../progress/technical-debt.md) allocates DT-01 onward for actual findings with location, effort, verification and closure; runtime uncertainties are planning blockers, not falsely completed work. Carry any cuts/unfinished tasks into the next release with context.

## Execution and Closure

Take one Ready task; perform its test/review-first steps; record actual hours and output; update YAML status, feature evidence and [Progress Log](../progress/progress-log.md). Follow [Release and Post-mortem](release-and-postmortem.md) for candidate freeze, SemVer/changelog, clean deployment smoke, rollback, debt migration and estimated-versus-actual review.
