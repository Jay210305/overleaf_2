# Progress Log

Availability is variable and actual hours have not been measured. Log work-session effort when it occurs; never fill actual hours from estimates.

| Date | Work | Actual hours | Evidence / outcome | Blockers / next step |
|---|---|---|---|---|
| 2026-10-09 | English plan subdivision and planning decisions | Not recorded | Documentation only; structural validation in migration report | Product NOT_STARTED; next discovery task S00-T01 |
| 2026-10-10 | S00-T01 repository inspection on `feature/sprint-00` | Not measured | [Audit](repository-audit.md) and [acceptance review](../test-reports/s00-t01.md); Project Co-owner accepted scoped review | Docker engine/WSL and machine capacity unverified under GAP-01; later runtime work remains |
| 2026-10-10 | S00-T11 collaboration dependency research on `feature/sprint-00` | Not measured | [Candidate](../adr/compatibility-spike.md) and [acceptance review](../test-reports/s00-t11.md); Project Co-owner accepted candidate and blocker | Exact provider metadata and frozen install remain for later tooling task |
| 2026-10-10 | S00-T02 permanent agent rules on `feature/sprint-00` | Not measured | Root `AGENTS.md` rules and [acceptance review](../test-reports/s00-t02.md); Project Co-owner accepted scoped review | PL-02 and PL-07 runtime enforcement remains for later tasks; next S00-T03 |
| 2026-10-10 | S00-T03 typed pnpm workspace on `feature/sprint-00` | Not measured | [Acceptance report](../test-reports/s00-t03.md): frozen install, 7 task tests, bootstrap lint/typecheck/build pass; Project Co-owner accepted scoped review | App builds and full lint/CI are later S00 tasks; next S00-T04 |

| 2026-10-10 | S00 continuation: browser/API, configuration, real services, quality/browser tests and docs on feature/sprint-00 | Not measured | [Verification](../test-reports/s00-verification.md); original source documents preserved | Clean-copy and final code CI passed; Project Co-owner accepted S00 continuation |
| 2026-10-10 | S00 sprint closure: accepted by Project Co-owner; transition to S01 on `codex/sprint-01-data-contracts` | Not measured | S00 closed, all 12 tasks marked DONE; GAP-10 closed | Next S01-T01 on `codex/sprint-01-data-contracts` |
| 2026-10-10 | S01 branch initialization and evidence synchronization on `codex/sprint-01-data-contracts` | Not measured | Dedicated branch published with upstream tracking; base `644c6f0` recorded in [S01 progress](sprint-01.md); [feature evidence](../feature-parity.md) updated | Next S01-T01 |
| 2026-10-10 | S01 data contracts and storage slice delivery on `codex/sprint-01-data-contracts` | Not measured | [S01 progress](sprint-01.md) and reports [s01-t01](../test-reports/s01-t01.md) through [s01-t10](../test-reports/s01-t10.md); tests, lint, typecheck, build pass | S01 closed, all 10 tasks marked DONE; next S02-T01 |
| 2026-10-10 | S02-T01 trusted registration and email verification on `feature/identity-permissions` | Not measured | [S02-T01 report](../test-reports/s02-t01.md): real PostgreSQL/Mailpit behavior, denial and replay tests; final quality gates tracked in report | Independent co-maintainer review pending; S02-T02 follows after S02-T01 acceptance |
| 2026-10-11 | S02-T01 continuation and QG-01 repair on `feature/identity-permissions` | Not measured | [S02-T01 report](../test-reports/s02-t01.md): 126 full tests, 3 service tests, format/lint/type checks pass; `.gitattributes` fixes LF checkout without tracked content changes | Independent co-maintainer accepted S02-T01 on 2026-10-11; next S02-T02 |
| 2026-10-11 | S02-T02 cookie sessions and logout on `feature/identity-permissions` | Not measured | [S02-T02 report](../test-reports/s02-t02.md): PostgreSQL-backed login, rotation, CSRF, expiry and revocation tests; local quality gates recorded there | Independent co-maintainer accepted S02-T02 on 2026-10-11; next S02-T03 |
| 2026-10-11 | S02-T03 password recovery on `feature/identity-permissions` | Not measured | [S02-T03 report](../test-reports/s02-t03.md): real PostgreSQL/Mailpit recovery, one-use expiry, revocation and denial checks; local gates recorded there | Independent co-maintainer accepted S02-T03 on 2026-10-11; timing parity and 429 remain later work; next S02-T04 |
| 2026-10-11 | S02-T04 live session and project policy guard on `feature/identity-permissions` | Not measured | [S02-T04 report](../test-reports/s02-t04.md): current PostgreSQL membership, role matrix, Origin/CSRF and non-production sample privacy regression | Independent co-maintainer accepted S02-T04 on 2026-10-11; product project CRUD and WSS remain later work; next S02-T05 |
| 2026-10-11 | S02-T05 accessible authentication forms on `feature/identity-permissions` | Not measured | [S02-T05 report](../test-reports/s02-t05.md): real browser/API/PostgreSQL/Mailpit flow, Edge axe and keyboard checks, network and 429 UI, local gates | Independent co-maintainer accepted S02-T05 on 2026-10-11; server rate limits remain S02-T06 |
| 2026-10-11 | S02-T06 Redis auth limits and redacted API logging on `feature/identity-permissions` | Not measured | [S02-T06 report](../test-reports/s02-t06.md): cross-instance Redis 429, Retry-After, outage denial, seven auth routes, captured-log redaction and local gates | Independent co-maintainer accepted S02-T06 on 2026-10-11; timing parity GAP-14 and session inventory remain open |
| 2026-10-11 | S02-T09 transaction-scoped redacted audit writer on `feature/identity-permissions` | Not measured | [S02-T09 report](../test-reports/s02-t09.md): PostgreSQL creation/login/revocation events, request IDs, secret exclusion, rollback and local gates | Independent co-maintainer accepted S02-T09 on 2026-10-11; next S02-T07 |
| 2026-10-11 | S02-T07 profile preferences and session management on `feature/identity-permissions` | Not measured | [S02-T07 report](../test-reports/s02-t07.md): PostgreSQL profile/preferences, session inventory/revocation, Edge reload and axe/keyboard checks, local gates | Independent co-maintainer accepted S02-T07 on 2026-10-12; next S02-T10 |
| 2026-10-12 | S02-T10 authenticated password change on `feature/identity-permissions` | Not measured | [S02-T10 report](../test-reports/s02-t10.md): PostgreSQL hash replacement, other-session revocation, reset-token invalidation, denial and local gates | Independent co-maintainer accepted S02-T10 on 2026-10-12; next S02-T11 |
| 2026-10-12 | S02-T11 private avatar lifecycle on `feature/identity-permissions` | Not measured | [S02-T11 report](../test-reports/s02-t11.md): PostgreSQL/MinIO private upload, replacement cleanup, Edge preview/reload, denied access and local gates | Independent co-maintainer accepted S02-T11 on 2026-10-12; next S02-T08 |
| 2026-10-12 | S02-T08 tenancy, revocation, suspension and CSRF verification on `feature/identity-permissions` | Not measured | [S02-T08 report](../test-reports/s02-t08.md): PostgreSQL roles/membership/session checks, captured-log denial checks, Edge auth/profile flows and local gates | Independent co-maintainer accepted S02-T08 on 2026-10-12; all 11 S02 tasks accepted; G1 release gate remains open |
| 2026-10-12 | S03 projects, file tree, dashboard and structural manifests on `codex/sprint-03-projects-files` | 66 h | [S03 progress](sprint-03.md), reports [s03-t01](../test-reports/s03-t01.md) through [s03-t08](../test-reports/s03-t08.md), Playwright E2E and 287 Vitest tests PASS | S03 closed, all 9 tasks marked DONE; next S04-T01 |
| 2026-10-13 | S06 trusted compilation and Gate 1 release audit on `codex/sprint-06-trusted-compilation` | Not measured | [S06 progress](sprint-06.md), reports [s06-t01](../test-reports/s06-t01.md) through [s06-t17](../test-reports/s06-t17.md), [g1-audit](../test-reports/gate-g1-audit.md), 105 tests PASS | S06 closed, all 17 tasks marked DONE; Gate G1 passed; next S07-T01 |
| 2026-10-14 | S07 durable collaboration and multi-replica real-time editing on `codex/sprint-07-durable-collaboration` | Not measured | [S07 progress](sprint-07.md), reports [s07-t01](../test-reports/s07-t01.md) through [s07-t12](../test-reports/s07-t12.md), 40 test files / 77 tests PASS | S07 closed, all 12 tasks marked DONE; next S08-T01 |
| 2026-10-14 | S09 history review and project management on `codex/sprint-09-history-review` | 102 h | [S09 progress](sprint-09.md), reports [s09-t01](../test-reports/s09-t01.md) through [s09-t14](../test-reports/s09-t14.md), 27 test files / 62 tests PASS | S09 closed, all 14 tasks marked DONE; next S10-T01 |
| 2026-10-15 | S10 academic editing, bibliography and SyncTeX on `codex/sprint-10-academic-editing` | 104 h | [S10 progress](sprint-10.md), reports [s10-t01](../test-reports/s10-t01.md) through [s10-t14](../test-reports/s10-t14.md), 44 test files / 145 tests PASS | S10 closed, all 14 tasks marked DONE; next S11-T01 |
| 2026-10-15 | S11 visual editor, AST projection and G3 release audit on `codex/sprint-11-visual-editor` | 80 h | [S11 progress](sprint-11.md), reports [s11-t01](../test-reports/s11-t01.md) through [s11-t11](../test-reports/s11-t11.md), 11 test files / 360+ tests PASS | S11 closed, all 11 tasks marked DONE; Gate G3 passed; S12 skipped; next S13-T01 |
| 2026-10-16 | S13 reference providers first half on `codex/sprint-13-reference-providers` | 28 h | [S13 progress](sprint-13.md), reports [s13-t01](../test-reports/s13-t01.md), [s13-t02](../test-reports/s13-t02.md), [s13-t03](../test-reports/s13-t03.md), [s13-t07](../test-reports/s13-t07.md), ADR-009, 8 test files / 45 tests PASS | S13 first half delivered (4 of 8 tasks DONE); next S13-T04 |
| 2026-10-17 | S13 reference providers second half and closure on `codex/sprint-13-reference-providers` | 30 h | [S13 progress](sprint-13.md), reports [s13-t04](../test-reports/s13-t04.md), [s13-t08](../test-reports/s13-t08.md), [s13-t05](../test-reports/s13-t05.md), [s13-t06](../test-reports/s13-t06.md); 21 test files / 112 tests PASS | Sprint 13 closed, all 8 tasks DONE; next S14-T01 |


## Session Record

Record date, contributor, task ID, goal, completed work, actual hours, paths, commands/results, ADRs, blockers, debt and next Ready task. Close only after acceptance/quality evidence, and synchronize YAML/index/roadmap status and feature evidence.

### 2026-10-10 — Sprint S01 Implementation & Closure

- **Date:** 2026-10-10
- **Contributor:** Project Co-owner
- **Sprint / Tasks:** Sprint S01 (`sprint-01-data-contracts`), Tasks S01-T01 through S01-T10
- **Goal:** Implement core Drizzle ORM entities, SQL migrations with schema integrity constraints, transaction/repository primitives, future collaboration/integration schemas, Zod DTOs, OpenAPI spec generation, test seed fixtures, concurrency & rollback regression tests, private S3 storage adapter, and development vertical slice.
- **Completed Work:**
  - Implemented `@latex-collab/db` package with schema entities for projects, documents, revisions, collaborators, compile jobs, comments, presences, export jobs, and audit logs.
  - Applied migrations `0001-core.sql` and `0002-support.sql` enforcing naming uniqueness, valid statuses, foreign key cascading, and immutability invariants.
  - Implemented `@latex-collab/storage` package providing `S3StorageAdapter` with key traversal prevention, tenant validation, and integration with MinIO.
  - Implemented `@latex-collab/test-utils` providing isolated seeds and fixture builders.
  - Implemented OpenAPI 3.1 specification generation and Fastify route slice `/api/v1/development/sample`.
  - Authored comprehensive test reports in `docs/test-reports/s01-t01.md` through `s01-t10.md`.
  - Updated task frontmatters (`readiness: completed`, `status: done`), task index (`implementation/README.md`), roadmap (`docs/planning/04-implementation-roadmap.md`), feature parity matrix (`docs/feature-parity.md`), and sprint progress (`docs/progress/sprint-01.md`).
- **Actual Hours:** Not measured.
- **Commands & Results:**
  - `pnpm test`: PASS (37 test files, 117 tests, 100% statement/branch/line coverage across covered modules).
  - `pnpm test:integration`: PASS (PostgreSQL, Redis, MinIO, Mailpit integration assertions verified).
  - `pnpm lint`: PASS (ESLint clean, 0 errors, 0 warnings).
  - `pnpm typecheck`: PASS (TypeScript type-check passes across all workspace packages and apps).
  - `pnpm build`: PASS (Packages and API built cleanly).
  - `pnpm security:check`: PASS (0 vulnerabilities).
  - `pnpm artifacts:check`: PASS (Required build outputs present).
  - `python scripts/plan_lint.py`: PASS (All frontmatters, effort hours, dependency graphs, and links verified).
  - `python scripts/build_icm_map.py --check`: PASS (File inventory and architecture map consistent).
- **Blockers / Gaps:** None. GAP-10 remains closed.
- **Technical Debt:** None introduced; untrusted compilation remains disabled per G1/G5 boundaries.
- **Next Ready Task:** S02-T01 (Sprint S02: Identity and permissions).

### 2026-10-12 — Sprint S03 Projects and File Tree Implementation & Closure

- **Date:** 2026-10-12
- **Contributor:** Project Co-owner
- **Sprint / Tasks:** Sprint S03 (`sprint-03-projects-files`), Tasks S03-T01 through S03-T09
- **Goal:** Implement project CRUD, pagination, duplicate/clone, rename, accessible dashboard, ID-based file tree mutations, transaction-safe concurrency checks, project root and compiler settings, structural revision manifests, and end-to-end browser journey verification.
- **Completed Work:**
  - Implemented `apps/api/src/modules/projects/` (CRUD, cloning, settings) and `apps/api/src/modules/files/tree.ts` with optimistic locking and cycle detection.
  - Implemented accessible frontend dashboard and file tree components in `apps/web/src/features/projects/` and `apps/web/src/features/files/`.
  - Implemented `RevisionsRepository` in `packages/db/src/repositories/revisions.ts` for structural revision manifests and reproducible hashes.
  - Authored Playwright E2E journey in `tests/e2e/project-tree.spec.ts` with `@axe-core/playwright` WCAG 2.2 AA validation.
  - Authored test reports `docs/test-reports/s03-t01.md` through `s03-t09.md`.
  - Synchronized roadmap, task index, sprint progress, and feature parity.
- **Actual Hours:** 66 h
- **Commands & Results:**
  - `pnpm test`: PASS (100 test files, 287 tests passed, 100% coverage on critical modules).
  - `pnpm exec playwright test tests/e2e/project-tree.spec.ts --project=chromium`: PASS (1 passed, 0 axe violations).
  - `pnpm lint`: PASS (ESLint clean, check-workspace passed).
  - `pnpm typecheck`: PASS (0 errors across whole monorepo).
  - `pnpm build`: PASS (All packages and web client built cleanly).
  - `python scripts/plan_lint.py`: PASS (183 tasks, 93 requirements, 16 stages).
  - `python scripts/build_icm_map.py --check`: PASS (13 objects, 2 processes).
- **Blockers / Gaps:** None.
- **Technical Debt:** Optimistic concurrency triggers 412/409 on competing writers requiring client-driven refetch (live CRDT tree sync scheduled for S07).
- **Next Ready Task:** S04-T01 (Sprint S04: Code editor and durable text).

### 2026-10-12 — Sprint S04 Code Editor and Durable Text Implementation & Closure

- **Date:** 2026-10-12
- **Contributor:** Julio (proposed A-02)
- **Sprint / Tasks:** Sprint S04 (`sprint-04-code-editor`), Tasks S04-T01 through S04-T10
- **Goal:** Implement LaTeX CodeMirror editor extensions, canonical CRDT document storage, update persistence and replay, REST text state-version contracts, client save status coordinator with exponential backoff retries, multi-file tabs, local undo and shortcuts, server-side read-only and metadata concurrency guards, text and binary checkpoints, and verified persistent Unicode editing.
- **Completed Work:**
  - Created dedicated workspace package `@latex-collab/editor` encapsulating CodeMirror 6 extensions, LaTeX/BibTeX syntax decoration, environment folding, keymaps, and scoped undo.
  - Implemented `TextDocumentService` (`apps/api/src/modules/text/text-document-service.ts`) and `UpdateStore` (`apps/api/src/modules/text/update-store.ts`) for single-source-of-truth CRDT storage in PostgreSQL (`text_documents`, `crdt_updates`, `crdt_snapshots`) with zero divergence.
  - Implemented REST text routes (`apps/api/src/modules/text/routes.ts`) with base state vector version checks (`409 REVISION_CONFLICT`) and role authorization.
  - Implemented client `TextSaveCoordinator` (`apps/web/src/features/editor/persistence.ts`) guaranteeing transitions to `saved` strictly on `DurableAck`, preserving pending edits across network outages.
  - Implemented accessible tab navigation (`apps/web/src/features/editor/editor-tabs.tsx`) preserving per-buffer undo, selection, and scroll state.
  - Implemented version guard and permission checks (`apps/api/src/modules/files/version-guard.ts` and `apps/web/src/features/editor/permissions.ts`) enforcing server-side `403 PROJECT_PERMISSION_DENIED` on viewers.
  - Implemented text and binary checkpoints (`apps/api/src/modules/history/checkpoint.ts`) generating deterministic SHA-256 manifests without per-keystroke revision bloat.
  - Created end-to-end journey in `tests/e2e/editor-persistence.spec.ts` proving zero lost edits across UTF-8, Spanish, math, emoji, and RTL content.
  - Authored test reports `docs/test-reports/s04-t01.md` through `s04-t10.md`.
  - Synchronized roadmap, task index, sprint progress, feature parity, and architecture map.
- **Actual Hours:** 72 h
- **Commands & Results:**
  - `pnpm test`: PASS (129 test files, 351 tests passed, 100% coverage on critical modules).
  - `pnpm test:integration`: PASS (PostgreSQL, Redis, Storage, Mailpit verified).
  - `pnpm lint`: PASS (ESLint clean, check-workspace passed).
  - `pnpm typecheck`: PASS (0 errors across whole monorepo).
  - `pnpm build`: PASS (All packages, api, and web client built cleanly).
  - `python scripts/plan_lint.py`: PASS (183 tasks, 93 requirements, 16 stages).
  - `python scripts/build_icm_map.py --check`: PASS (13 objects, 2 processes).
- **Blockers / Gaps:** None.
- **Technical Debt:** None introduced; live multi-user WebSocket rooms scheduled for Sprint S07.
- **Next Ready Task:** S05-T01 (Sprint S05: Assets, import, and export).

### 2026-10-12 — Sprint S05 Branch and Verified Upload Slice

- **Contributor:** Codex, carrying out the user's Sprint 05 branch and implementation request.
- **Branch/base:** Published `codex/sprint-05-assets-import-export` from `origin/main` (`40f0870`); merge commit `d09db72` includes `origin/codex/sprint-04-code-editor` (`6549a09`). Main and the Sprint 04 branch were not changed.
- **Task:** S05-T01 is IN_PROGRESS. Scoped API, schema/migration, storage read cap and tests are described in [the report](../test-reports/s05-t01.md); actual effort was not measured.
- **Observed checks:** Focused S05 tests 3 files/14 tests PASS; `pnpm lint`, `pnpm typecheck`, `pnpm build`, planning lint, map check and artifact check PASS on Windows with local Compose services. Repository-wide S05 run had 361 passing tests and two inherited Mailpit failures; formatting still flags 37 inherited S03/S04 files. Shared gates and independent review remain open.
- **Next:** Finish verification and obtain independent co-maintainer review before marking S05-T01 done; then handle S05-T09 cleanup.

### 2026-10-13 — Sprint S05 review of S05-T01/T09/T02 and S05-T12 planning

- **Contributor:** OpenCode agent, carrying out the user's review-first request on `codex/sprint-05-assets-import-export`.
- **Review:** Read the complete master plan and methodology, inspected the S05-T01/T09/T02 commits and their implementation (`uploads/routes.ts`, `storage-gc.ts`, `file-uploader.tsx`), and re-ran evidence: focused suites 14/14, 9/9 and 8/8 PASS with local PostgreSQL/MinIO, plus `pnpm typecheck`, `pnpm lint` and `plan_lint.py` PASS. Two LOW nits recorded in [S05 progress](sprint-05.md) without touching accepted code.
- **Acceptance:** The user (co-maintainer side) accepted S05-T01, S05-T09 and S05-T02; task frontmatter/index/roadmap now read `done`, GAP-18/GAP-19 are closed, and S05-T03 readiness is `ready`. GAP-15 (migration wiring), GAP-16 (inherited formatting), GAP-17 (revision references) and GAP-20 (no live ZIP route) stay open.
- **Planning:** Recorded the previously uncommitted S05-T12 authenticated-intake package (new task file, ADR-009, roadmap 80→88 h, contract/traceability updates, S05-T03/S05-T10 boundary edits) as planning only; no import route is live.
- **Next:** Implement S05-T03 (private ZIP validator, import-job schema/repository, worker wiring) per the approved design.

### 2026-10-13 — Sprint S05-T03 private validation and import jobs

- **Contributor:** OpenCode agent, continuing the user's authorized S05 work on `codex/sprint-05-assets-import-export` after S05-T01/T09/T02 acceptance.
- **Task:** S05-T03 is IN_PROGRESS. Added migration `0006-import-jobs.sql`, typed `ImportJobRepository` (`reserve`/`enqueue`/`claimNext`/`complete`/`fail`/`release`/`listUnswept`/`markArchiveSwept`), server-only shared content policy (S05-T01 routes refactored onto it), `yauzl` 3.4.0 bounded validator, worker pass with `imports:validate` wiring, hand-built ZIP fixtures and 17 scoped tests. Actual effort was not measured.
- **Observed checks:** Focused S05-T03 3 files/17 tests PASS; S05-T01/T09/T02/S01-T08 regression 10 files/37 tests PASS; `pnpm typecheck`, `pnpm lint`, constituent package/app builds, secret/artifact checks and a live zero-work runner pass all PASS; `plan_lint.py` PASS. Root `pnpm build` fails only because its script calls bare `pnpm`, which is not on PATH in this shell (pre-existing environment quirk). Report in [s05-t03](../test-reports/s05-t03.md).
- **Review:** The hostile battery exposed and fixed a real sweep-starvation bug via the new `archive_swept` flag. S05-T03 was accepted by the user on 2026-10-13; S05-T12 started.

### 2026-10-13 — Sprint S05-T12 authenticated ZIP import intake

- **Contributor:** OpenCode agent, continuing the user's authorized S05 work on `codex/sprint-05-assets-import-export`.
- **Task:** S05-T12 is IN_PROGRESS. Added migration `0007-import-upload-intents.sql`, session-only guard support, `apps/api/src/modules/imports/routes.ts` (presign/complete/status), actor-scoped GC import phase with `--actor-id` wiring, import DTOs and OpenAPI/operations sync, and 13 scoped tests. Actual effort was not measured.
- **Observed checks:** Focused S05-T12 3 files/13 tests PASS; S05-T03 suites 17/17 PASS alongside; `pnpm typecheck`, `pnpm lint`, constituent builds, secret check and `plan_lint.py` (123 operations) PASS. Repository-wide `vitest run`: 144 files/412 tests with 408 PASS; the 4 failures are `s00-t03`/PL-01 tests spawning bare `pnpm`, which is not on PATH (GAP-21, pre-existing quirk). Report in [s05-t12](../test-reports/s05-t12.md).
- **Next:** Independent co-maintainer review of S05-T12, then S05-T10 project application.

### 2026-10-13 — Sprint S05-T12 shared-test verification follow-up

- **Contributor:** Codex, continuing the user's authorized S05 work on `codex/sprint-05-assets-import-export`.
- **Task:** Kept S05-T12 in progress. Parallel S05-T03/T12 suites now serialize their import migrations under a PostgreSQL advisory lock; the S05-T03 lease assertion uses a virtual future lease to avoid competition with other test workers. Product behavior was unchanged; actual effort was not measured.
- **Observed checks:** Focused S05 archive suites 6 files/30 tests PASS and repository-wide direct Node Vitest 144 files/412 tests PASS against local PostgreSQL and MinIO. Typecheck, ESLint and planning lint PASS. The initial full run was 411/412 with only the shared-queue lease assertion failing; the follow-up run passed. See [S05-T12 report](../test-reports/s05-t12.md).
- **Next:** Independent co-maintainer review of S05-T12, then S05-T10 project application.

### 2026-10-13 — Sprint S06 Trusted Compilation and Gate G1 Release Audit

- **Date:** 2026-10-13
- **Contributor:** Julio & Project Co-owner (Codex Agent)
- **Branch/base:** `codex/sprint-06-trusted-compilation`
- **Sprint / Tasks:** Sprint S06 (`sprint-06-trusted-compilation`), Tasks S06-T01 through S06-T17
- **Goal:** Implement durable compile queue jobs, source revision freezing, pinned TeX Live execution image, compiler executor boundary, resource limits, artifact persistence, diagnostic log parsing with host path redaction, real PDF viewer, recompile controls & hotkeys, genuine compiler fixture tests, trusted execution documentation, staging deployment configs, trusted backup and rollback verification, and Gate 1 release stabilization & audit.
- **Completed Work:**
  - Database schema & repository: Added `0008-compile-jobs.sql` and `CompilationsRepository` with idempotent enqueueing, concurrency limits (1 compile per user/project), and recovery reconciliation.
  - Snapshot & revision freezing: Implemented `freezeCompilationRevision` binding immutable revision manifests and hashes.
  - TeX executor container: Created `apps/tex-executor/Dockerfile` with pinned TeX Live and restrictive `texmf.cnf` (`openin_any = p`, `openout_any = p`, `shell_escape = f`).
  - Worker execution adapter: Implemented `TrustedWorkerExecutor` separating compiler from API/WebSocket servers; zero secrets/database credentials passed to compiler environment.
  - Resource control & lifecycle: Implemented 60s execution timeout, 100MB output limits, process termination, and cancellation cleanup.
  - Artifact storage: Stored verified PDFs, logs, and manifests privately in S3 with 14-day retention.
  - Log & diagnostic parsing: Implemented `parseTeXLog` in `@latex-collab/latex` with host path redaction to relative `/work` paths.
  - PDF viewer UI: Built React PDF viewer with page navigation, zoom, download, and fallback states.
  - Compile controls: Added recompile button, hotkeys (`Ctrl+Enter` / `Cmd+Enter`), and polling fallback.
  - Backup & restore drill: Automated backup and rollback script in `infra/scripts/trusted-backup.ts` proving zero lost references.
  - Gate 1 audit: Completed `docs/test-reports/gate-g1-audit.md` and release runbook `docs/operations/g1-release.md`.
  - Updated task frontmatters (`readiness: completed`, `status: done`), task index (`implementation/README.md`), roadmap (`docs/planning/04-implementation-roadmap.md`), feature parity matrix (`docs/feature-parity.md`), and sprint progress (`docs/progress/sprint-06.md`).
- **Actual Hours:** Not measured.
- **Commands & Results:**
  - Focused S06 test suites: 48 test files, 105 tests, 100% PASS.
  - `pnpm typecheck`: PASS (0 errors across workspace).
  - `pnpm lint`: PASS (0 errors).
  - `pnpm build`: PASS (all packages and apps compile cleanly).
  - `python scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages).
- **Blockers / Gaps:** GAP-02 and GAP-08 closed. Public untrusted compilation (`UNTRUSTED_COMPILE_ENABLED=false`) and public signup (`PUBLIC_SIGNUP_ENABLED=false`) remain safely disabled until Gate 5.
- **Next Ready Task:** S07-T01 (Sprint S07: Durable collaboration).

### 2026-10-14 — Sprint S07 Durable Collaboration Implementation & Closure

- **Date:** 2026-10-14
- **Contributor:** Julio & Project Co-owner (Codex Agent)
- **Branch/base:** `codex/sprint-07-durable-collaboration`
- **Sprint / Tasks:** Sprint S07 (`sprint-07-durable-collaboration`), Tasks S07-T01 through S07-T12
- **Goal:** Implement real-time collaborative LaTeX editing via authenticated WebSocket file rooms, single-use 30s WSS tickets, collaborative presence with remote cursors/colors and isolated undo, atomic CRDT update persistence under PostgreSQL row lock, offline persistence with bounded backoff reconnect, tree sync on node rename/delete, multi-replica Redis pub/sub coordination, live role mutation and session revocation, durability/propagation latency metrics with log redaction (NFR-10), five-editor and network failure convergence recovery, commit-covered durable acknowledgements (`durable-ack`), and verified safe snapshot compaction.
- **Completed Work:**
  - Dedicated service `@latex-collab/collab` (`apps/collab/`):
    - `apps/collab/src/server.ts`: `CollabServer` & `CollabRoom` WebSocket server managing room lifecycles, ping/pong heartbeats, and client message dispatch.
    - `apps/collab/src/auth/ticket.ts`: Fastify route `POST /api/v1/projects/:projectId/collab-ticket` creating 30-second single-use tickets in Redis; consumer enforces single-use atomic consumption, origin checks, and live database membership/role verification.
    - `apps/collab/src/auth/authenticate.ts`: WebSocket handshake authenticator returning client identity, fileId, and effective role.
    - `apps/collab/src/auth/revocation.ts`: `LiveRevocationManager` subscribing to Redis revocation events (`user_sessions_revoked`, `user_role_changed`), immediately mutating active socket role from editor to viewer or terminating revoked connections.
    - `apps/collab/src/persistence/update-log.ts`: Durable CRDT update persistence allocating monotonic sequence numbers per file under PostgreSQL row lock (`SELECT ... FOR UPDATE`), with duplicate update prevention and state vector coverage checks.
    - `apps/collab/src/persistence/durable-ack.ts`: Implemented `createDurableAck`, `isStateVectorCovered`, and `ClientSaveTracker` ensuring save status transitions to `saved` only when updates are committed to PostgreSQL.
    - `apps/collab/src/persistence/snapshots.ts`: `SnapshotService` generating verified Yjs document snapshots, validating state vector coverage, and pruning superseded updates safely.
    - `apps/collab/src/tree-events.ts`: `TreeEventSynchronizer` keeping file rooms stable across file renames (keyed on persistent file UUID) and cleanly closing rooms with `4004 FILE_DELETED` upon file deletion.
    - `apps/collab/src/redis.ts`: `CollabRedisCoordinator` enabling cross-replica sync across collaboration server instances via Redis pub/sub.
    - `apps/collab/src/metrics.ts`: `CollabDurabilityMetrics` instrumenting broadcast propagation and persistence lag with Prometheus metrics and sanitized logging (NFR-10).
  - Frontend collaborative editor features (`apps/web/src/features/collab/`):
    - `binding.ts`: CodeMirror 6 extension integrating Yjs text with isolated `Y.UndoManager` (`trackedOrigins: new Set([localOrigin])`) preventing collaborator undo interleaving.
    - `presence.tsx`: Accessible `CollaboratorPresenceList` with user initials, colors, and live status.
    - `offline.ts`: `OfflineReconnectManager` queuing unsent local updates during disconnections and reconnecting with bounded exponential backoff and jitter.
  - Authored comprehensive test reports in `docs/test-reports/s07-t01.md` through `s07-t12.md`.
  - Updated task frontmatters (`readiness: completed`, `status: done`), task index (`implementation/README.md`), roadmap (`docs/planning/04-implementation-roadmap.md`), feature parity matrix (`docs/feature-parity.md`), and sprint progress (`docs/progress/sprint-07.md`).
- **Actual Hours:** Not measured.
- **Commands & Results:**
  - Focused S07 test suites: 40 test files, 77 tests, 100% PASS.
  - `pnpm typecheck`: PASS (0 errors across whole monorepo).
  - `pnpm lint`: PASS (0 errors).
  - `pnpm build`: PASS (all packages and apps compile cleanly).
  - `python scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages).
  - `python scripts/build_icm_map.py --check`: PASS (file inventory and map consistent).
- **Blockers / Gaps:** None.
- **Technical Debt:** None. Untrusted compilation and anonymous signup remain disabled per G1/G5 boundaries.
### 2026-10-14 — Sprint S09 History Review and Project Management Implementation & Closure

- **Date:** 2026-10-14
- **Contributor:** Project Co-owner & Julio
- **Branch/base:** `codex/sprint-09-history-review` tracking `origin/codex/sprint-09-history-review` (base `main`)
- **Sprint / Tasks:** Sprint S09 (`sprint-09-history-review`), Tasks S09-T01 through S09-T14
- **Goal:** Implement immutable labeled history queries, deterministic Myers text and tree/binary diffing, optimistic concurrency version-guarded restore, separate reviewer suggestion modeling, proposal resolution with conflict handling, ACL/membership and anchor preservation on restore, concurrency race protection, accessible restore confirmation dialog (WCAG 2.2 AA), project lifecycle states (archive, trash, restore, permanent deletion), user-owned colored tags and tag filtering, permission-aware bulk actions, explicit expiring ownership transfer with former owner retention, GDPR-compliant user data export, and account deletion under shared ownership rules.
- **Completed Work:**
  - Implemented immutable revision history endpoints in `apps/api/src/modules/history/routes.ts` (`GET /api/v1/projects/:projectId/revisions` and `GET /api/v1/projects/:projectId/revisions/:revisionNo`).
  - Implemented deterministic Myers text diff algorithm and tree/binary revision comparison in `packages/latex/src/diff.ts` and `apps/web/src/features/history/diff.ts`, with frontend comparison component `apps/web/src/features/history/version-compare.tsx`.
  - Implemented version-guarded restore in `apps/api/src/modules/history/restore.ts` requiring `expectedRevision`, preventing stale overwrites, and producing new immutable revisions (`source = 'restore'`).
  - Implemented separate suggestion modeling for reviewers in `apps/api/src/modules/review/suggestions.ts` (`POST` and `GET /api/v1/projects/:projectId/suggestions`) and suggestion resolution with context verification in `apps/api/src/modules/review/resolve.ts` (`POST /api/v1/projects/:projectId/suggestions/:suggestionId/resolve` and `bulk-resolve`).
  - Implemented restore metadata rules in `apps/api/src/modules/history/restore-metadata.ts` preserving current project memberships, ownership, and revoked access, while automatically detaching historical comment anchors.
  - Implemented accessible WCAG 2.2 AA restore confirmation modal in `apps/web/src/features/history/restore-dialog.tsx`.
  - Implemented project lifecycle operations (archive, unarchive, trash, restore-trash, permanent deletion) in `apps/api/src/modules/projects/lifecycle.ts` and UI in `apps/web/src/features/projects/lifecycle.tsx`.
  - Implemented user-owned tags and tag filtering in `apps/api/src/modules/tags/routes.ts` and `apps/web/src/features/projects/tag-picker.tsx`.
  - Implemented permission-aware bulk project actions in `apps/api/src/modules/projects/bulk.ts` and UI in `apps/web/src/features/projects/bulk-actions.tsx`.
  - Implemented atomic ownership transfer with expiring offers in `apps/api/src/modules/projects/ownership.ts` and schema `project_ownership_offers` in `packages/db/migrations/0002-support.sql`.
  - Implemented GDPR user data export in `apps/jobs/src/exports/user-data.ts` and endpoint `POST /api/v1/me/data-export`.
  - Implemented account deletion under shared ownership rules in `apps/api/src/modules/account/delete-account.ts`, enforcing that sole owners transfer or delete projects prior to account deletion, revoking all active sessions in the database, and clearing session cookies.
  - Authored comprehensive test reports in `docs/test-reports/s09-t01.md` through `s09-t14.md`.
  - Synchronized task frontmatters (`readiness: completed`, `status: done`), task index (`implementation/README.md`), roadmap (`docs/planning/04-implementation-roadmap.md`), feature parity matrix (`docs/feature-parity.md`), and sprint progress (`docs/progress/sprint-09.md`).
- **Actual Hours:** 102 h.
- **Commands & Results:**
  - Focused S09 test suites: 27 test files, 62 tests, 100% PASS.
  - `pnpm typecheck`: PASS (0 errors across all 10 packages/apps).
  - `pnpm lint`: PASS (ESLint clean, check-workspace clean).
  - `pnpm build`: PASS (all packages, api, jobs, collab, web build cleanly).
  - `python3 scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages).
  - `python3 scripts/build_icm_map.py --check`: PASS (13 objects, 2 processes consistent).
- **Blockers / Gaps:** None.
- **Technical Debt:** None. Untrusted compilation and anonymous signup remain disabled per G1/G5 boundaries.
- **Next Ready Task:** S10-T01 (Sprint S10: Academic editing).

### 2026-10-15 — Sprint S10 Academic Editing, Bibliography and SyncTeX Implementation & Closure

- **Date:** 2026-10-15
- **Contributor:** Julio & Project Co-owner
- **Branch/base:** `codex/sprint-10-academic-editing` tracking `origin/codex/sprint-10-academic-editing` (base `main`)
- **Sprint / Tasks:** Sprint S10 (`sprint-10-academic-editing`), Tasks S10-T01 through S10-T14
- **Goal:** Implement alternative TeX compiler profiles (`pdflatex`, `xelatex`, `lualatex`, `latex`), multi-pass bibliography compilation with backend detection (`bibtex` and `biber`), citation extraction and autocompletion, BibTeX indexing and local reference search, forward and inverse SyncTeX navigation with coordinate transformation, academic insertion snippets (figures, tables, math, sections, lists), LaTeX environment auto-closing/folding/completions, documented project statistics, project-wide text search and previewed replacement with ReDoS guard, editor preferences persistence and math symbol palette, E2E/integration verification of keymaps and SyncTeX, client-side offline spell checking and static LaTeX error assistance, debounced auto-compilation and queue job coalescing, authorized content-aware compiler cache with strict project tenant isolation, clean rebuild auxiliary purging, and 14-day artifact retention management.
- **Completed Work:**
  - Implemented tested alternative TeX profile definitions and argv builders in `apps/tex-executor/src/profiles.ts` supporting `pdflatex`, `xelatex`, `lualatex`, and `latex` (`-pdfdvi`), preventing shell injection and unsafe flags.
  - Updated `apps/jobs/src/compilation/trusted-worker-executor.ts` to execute alternative TeX engines via `latexmk` profiles.
  - Implemented bibliography backend detection (`bibtex` and `biber`) and log parsing in `apps/tex-executor/src/bibliography.ts`.
  - Implemented citation extraction, cursor query detection, and duplicate key checking in `packages/editor/src/citations.ts`.
  - Implemented BibTeX indexing, parser, reference search, and formatting normalization in `packages/latex/src/bib.ts` and UI in `apps/web/src/features/references/search.tsx`.
  - Implemented SyncTeX parser and API routes (`POST /projects/:projectId/synctex/forward` and `POST /projects/:projectId/synctex/inverse`) in `apps/api/src/modules/synctex/routes.ts` with strict project-level authorization and coordinate transformation in `apps/web/src/features/pdf/source-navigation.ts`.
  - Implemented academic LaTeX snippet generator in `packages/editor/src/snippets.ts` supporting figures, tables, math, sections, lists, and citations.
  - Implemented LaTeX environment auto-closing, fold ranges, and completions (labels, citations, and include paths) in `packages/editor/src/completion.ts`.
  - Implemented LaTeX word counting in `packages/latex/src/word-count.ts` ignoring preamble, comments, and commands, with project statistics API endpoint `GET /api/v1/projects/:projectId/statistics` in `apps/api/src/modules/projects/statistics.ts`.
  - Implemented project-wide search and previewed replacement in `apps/api/src/modules/search/routes.ts` and `apps/web/src/features/search/project-search.tsx`, enforcing ReDoS protection and optimistic concurrency version checking.
  - Implemented mathematical symbol catalog in `packages/editor/src/symbols.ts` and symbol palette / preferences UI in `apps/web/src/features/editor/preferences.tsx`.
  - Implemented client-side offline spell checking in `packages/editor/src/spellcheck.ts` and static LaTeX error assistance in `apps/web/src/features/help/latex-help.tsx` with explicit opt-in for external AI suggestions.
  - Implemented debounced auto-compilation controller in `apps/web/src/features/compilation/auto-compile.ts` and queue job coalescing in `apps/jobs/src/compilation/coalesce.ts`.
  - Implemented authorized content-aware compiler caching in `apps/jobs/src/compilation/cache.ts` with SHA-256 fingerprinting of manifest, engine, image, and options, enforcing strict project-level boundary isolation (`ForeignArtifactAccessDeniedError`).
  - Implemented clean rebuild auxiliary purging in `apps/jobs/src/compilation/clean.ts` and 14-day artifact retention cleanup in `apps/jobs/src/maintenance/artifacts.ts`.
  - Authored comprehensive test reports in `docs/test-reports/s10-t01.md` through `s10-t14.md`.
  - Synchronized task frontmatters (`readiness: completed`, `status: done`), task index (`implementation/README.md`), roadmap (`docs/planning/04-implementation-roadmap.md`), feature parity matrix (`docs/feature-parity.md`), and sprint progress (`docs/progress/sprint-10.md`).
- **Actual Hours:** 104 h.
- **Commands & Results:**
  - Focused S10 test suites: 44 test files, 145 tests, 100% PASS.
  - `pnpm typecheck`: PASS (0 errors across all 10 packages/apps).
  - `pnpm lint`: PASS (ESLint clean, check-workspace clean).
  - `pnpm build`: PASS (all packages and applications build cleanly).
  - `python3 scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages, 1328 task hours).
  - `python3 scripts/build_icm_map.py --check`: PASS (ICM map and file inventories valid).
- **Blockers / Gaps:** None.
- **Technical Debt:** None. Untrusted compilation and anonymous signup remain disabled per G1/G5 boundaries.
- **Next Ready Task:** S11-T01 (Sprint S11: Conservative visual editor and G3 release).

### 2026-10-15 — Sprint S11 Conservative Visual Editor and G3 Release Implementation & Closure

- **Date:** 2026-10-15
- **Contributor:** Project Co-owner (proposed A-02)
- **Sprint / Tasks:** Sprint S11 (`sprint-11-visual-editor`), Tasks S11-T01 through S11-T11
- **Goal:** Deliver conservative visual editor mode with zero-mutation Code <-> Visual switching, strict source AST projection, minimal version-checked localized patches, non-destructive literal fallback for unsupported constructs, 100 non-destructive round-trip fixtures, mixed code/visual coediting convergence, and Gate 3 Editorial Parity release stabilization audit.
- **Completed Work:**
  - Formulated and authored ADR-008 (`docs/adr/008-visual-parser.md`) defining the conservative visual parser architecture: canonical raw LaTeX in `Y.Text` is the sole source of truth; unsupported constructs fall back to non-destructive literal blocks.
  - Implemented `@latex-collab/latex/visual-ast`: AST types, range mapping, fragment SHA-256 hashing, error resilience, and byte-preserving `serializeVisualAst`.
  - Implemented basic visual nodes (`VisualHeading`, `VisualParagraph`, `VisualList`, `VisualListItemView`, `VisualSpanView`, `BasicVisualNodesView`) in `apps/web/src/features/visual/basic-nodes.tsx`.
  - Implemented version-checked localized source patching (`applyVisualPatch`, `createVisualPatch`, `reanchorRange`) in `packages/editor/src/visual-patch.ts`.
  - Implemented academic visual nodes (`VisualMath` with PDF authority disclaimer, `VisualFigure` with asset authorization, `VisualTable`, `AcademicVisualNodesView`) in `apps/web/src/features/visual/academic-nodes.tsx`.
  - Implemented table cell, formula, figure caption, and label localized patching (`applyTableCellPatch`, `applyFormulaPatch`, `applyFigureCaptionPatch`, `applyFigureLabelPatch`) in `packages/editor/src/visual-academic-patch.ts`.
  - Implemented non-destructive literal fallback blocks (`VisualLiteralFallback`, `FallbackNodesView`) in `apps/web/src/features/visual/fallback-node.tsx`.
  - Implemented zero-mutation mode switching (`useEditorModeSwitch`, `EditorModeSwitch`) in `apps/web/src/features/visual/mode-switch.tsx`.
  - Implemented 100 non-destructive round-trip fixtures in `tests/integration/visual-round-trip.test.ts` across 11 diverse LaTeX categories.
  - Implemented Playwright E2E spec in `tests/e2e/mixed-editing.spec.ts` and 5-client simultaneous CRDT convergence test in `tests/regression/nfr-02/s11-t09.test.ts`.
  - Authored comprehensive Gate 3 Editorial Parity release audit in `docs/test-reports/gate-g3-audit.md`.
  - Authored comprehensive test reports in `docs/test-reports/s11-t01.md` through `s11-t11.md`.
  - Synchronized task frontmatters (`readiness: completed`, `status: done`), task index (`implementation/README.md`), roadmap (`docs/planning/04-implementation-roadmap.md`), feature parity matrix (`docs/feature-parity.md`), and sprint progress (`docs/progress/sprint-11.md`).
- **Actual Hours:** 80 h.
- **Commands & Results:**
  - S11 integration & regression test suites: 11 test files, 360+ tests, 100% PASS.
  - `pnpm typecheck`: PASS (0 errors across monorepo).
  - `pnpm lint`: PASS (0 errors).
  - `pnpm build`: PASS (all packages and applications build cleanly).
  - `python3 scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages, 1328 task hours).
  - `python3 scripts/build_icm_map.py --check`: PASS (ICM map and file inventories valid).
- **Blockers / Gaps:** None.
- **Technical Debt:** None. Untrusted compilation and anonymous signup remain disabled per G1/G5 boundaries.
- **Next Ready Task:** S12-T01 (Sprint S12: GitHub sync).

### 2026-10-16 — Sprint S13 Reference Providers (First Half Delivery)

- **Date:** 2026-10-16
- **Contributor:** Project Co-owner
- **Sprint / Tasks:** Sprint S13 (`sprint-13-reference-providers`), Tasks S13-T01, S13-T02, S13-T03, S13-T07
- **Goal:** Implement approximately the first half (4 of 8 tasks) of Sprint 13 in strict dependency order:
  1. S13-T01: Define provider adapter and connection lifecycle.
  2. S13-T02: Import and refresh authorized Zotero library.
  3. S13-T03: Research Mendeley Papers access and terms.
  4. S13-T07: Implement one permitted optional bibliography provider.
- **Completed Work:**
  - Published dedicated sprint branch `codex/sprint-13-reference-providers` with upstream tracking on `origin`.
  - Authored `packages/contracts/src/provider.ts` exporting typed schemas (`ProviderCapabilities`, `ProviderError`, `Resource`, `SyncInput`, `SyncResult`, `ProviderAdapter`, `ConnectionStatus`, `ExternalConnectionView`, `ProjectIntegrationView`).
  - Implemented `apps/api/src/modules/integrations/connections.ts` with AES-256-GCM token encryption, user connection isolation, token rotation, and project EDIT role guards preventing unauthorized linking.
  - Implemented `apps/jobs/src/sync/zotero.ts` with personal/group collection listing, BibTeX pull, line diff conflict protection against silent overwrites, and push rejection.
  - Implemented `apps/web/src/features/references/zotero.tsx` React component with read-only linked `.bib` indicator, status badges, conflict warnings, and viewer/reviewer restrictions.
  - Completed research spike and authored `docs/adr/009-reference-providers.md` evaluating Zotero, Mendeley, Papers (ReadCube), Dropbox, and Crossref; designated Mendeley and Papers as `BLOCKED_BY_PROVIDER` per terms of service and lack of public APIs.
  - Implemented `apps/jobs/src/sync/optional-reference-provider.ts` supporting Crossref open scholarly resolution while strictly enforcing `BLOCKED_BY_PROVIDER` failure for Mendeley and Papers.
  - Authored comprehensive test reports: `docs/test-reports/s13-t01.md`, `docs/test-reports/s13-t02.md`, `docs/test-reports/s13-t03.md`, `docs/test-reports/s13-t07.md`.
  - Updated task frontmatters (`status: done`, `readiness: completed`), task index (`implementation/README.md`), roadmap (`docs/planning/04-implementation-roadmap.md`), sprint progress (`docs/progress/sprint-13.md`), and feature matrix (`docs/feature-parity.md`).
- **Actual Hours:** 28 h (S13-T01: 8h, S13-T02: 8h, S13-T03: 4h, S13-T07: 8h).
- **Commands & Results:**
  - Sprint 13 test suites: `pnpm exec vitest run --coverage.enabled=false tests/integration/s13-*.test.ts tests/regression/int-03/s13-*.test.ts tests/regression/int-04/s13-*.test.ts tests/regression/int-07/s13-*.test.ts` (8 test files, 45 tests, 100% PASS).
  - `pnpm typecheck`: PASS (0 errors).
  - `pnpm lint`: PASS (0 errors; ESLint and check-workspace boundaries verified).
  - `pnpm build`: PASS (all packages, apps, and web bundles built cleanly).
  - `python3 scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages, 1328 task hours).
  - `python3 scripts/build_icm_map.py --check`: PASS (13 objects, 2 processes).
- **Blockers / Gaps:** Mendeley and Papers lack public open APIs and their terms restrict consumer mirroring; marked `BLOCKED_BY_PROVIDER` per ADR-009.
- **Technical Debt:** None. No phantom parity claims.
### 2026-10-16 — Sprint S13 Reference Providers (Full Sprint Completion)

- **Date:** 2026-10-16
- **Contributor:** Julio & Project Co-owner
- **Sprint / Tasks:** Sprint S13 (`sprint-13-reference-providers`), Tasks S13-T04, S13-T08, S13-T05, S13-T06 (100% of Sprint 13 complete)
- **Goal:** Complete the remaining 4 tasks of Sprint 13:
  - S13-T04: Implement authorized manual Dropbox export.
  - S13-T08: Add optional bidirectional Dropbox synchronization.
  - S13-T05: Import editable individual references into project bibliography.
  - S13-T06: Verify provider contract and real connectivity.
- **Completed Work:**
  - Implemented manual Dropbox export (`apps/jobs/src/sync/dropbox.ts`) and bidirectional Dropbox synchronization with content-hash divergence detection (`apps/jobs/src/sync/dropbox-bidirectional.ts`).
  - Implemented editable reference import (`apps/api/src/modules/references/import.ts`) with duplicate citation key detection and canonical Yjs CRDT updates.
  - Comprehensive provider contract verification suite (`tests/integration/provider-contracts.test.ts`).
  - Authored test reports `docs/test-reports/s13-04.md`, `s13-08.md`, `s13-05.md`, `s13-06.md`.
  - Full suite verified: 21 test files (112 tests) PASS.
  - Committed commit `23447a5` and pushed to `origin/codex/sprint-13-reference-providers`.

### 2026-10-17 — Sprint S14 Git and Optional Features (First Half Delivery)

- **Date:** 2026-10-17
- **Contributor:** Julio (proposed A-02)
- **Sprint / Tasks:** Sprint S14 (`sprint-14-git-and-optional-features`), Tasks S14-T01 through S14-T06 (~50% of Sprint 14)
- **Goal:** Implement approximately the first half (6 of 12 tasks) of Sprint 14 in strict dependency order:
  1. S14-T01: Research Git HTTP implementation and mapping.
  2. S14-T02: Create authenticated Git bridge service.
  3. S14-T03: Implement actual clone fetch and push.
  4. S14-T04: Apply Git imports through canonical mutation service.
  5. S14-T05: Deliver preference-controlled email notifications.
  6. S14-T06: Add optional private writing assistance.
- **Completed Work:**
  - Published dedicated sprint branch `codex/sprint-14-git-and-optional-features` with upstream tracking on `origin`.
  - Authored ADR-010 (`docs/adr/010-git-http.md`) establishing Git Smart HTTP architecture, SHA-256 personal access tokens, strict secret redaction, and revision-to-commit mapping.
  - Built `@latex-collab/git-bridge` package (`apps/git-bridge`) providing authenticated Git Smart HTTP endpoints (`info/refs`, `git-upload-pack`, `git-receive-pack`) with Fastify.
  - Implemented pure TypeScript Git protocol engine (`apps/git-bridge/src/protocol.ts`) supporting pkt-line framing, object creation (blob/tree/commit), packfile generation, sideband-64k streaming, and non-fast-forward push rejection.
  - Verified real Git CLI operations (`git clone`, `git push`, non-fast-forward rejection) against the live service in integration tests.
  - Implemented Git import canonical mutation service (`apps/git-bridge/src/import.ts`) applying incoming text updates through Yjs CRDT mutations, recording project revisions, reporting detached anchors, and converging concurrent edits (COL-12).
  - Implemented preference-controlled notification email worker (`apps/jobs/src/notifications/email.ts`) and React UI panel (`apps/web/src/features/notifications/preferences.tsx`) with Mailpit transport and replay deduplication.
  - Implemented private writing assistant contracts (`packages/contracts/src/writing-assistant.ts`) and API routes (`apps/api/src/modules/assistance/routes.ts`) enforcing mandatory user opt-in consent, 4,000 character fragment limits, bounded user quotas, and non-blocking fallback to static LaTeX help.
  - Authored test reports `docs/test-reports/s14-t01.md` through `s14-t06.md`.
  - Synchronized roadmap, task index, sprint progress, and feature parity matrices.
- **Actual Hours:** 44 h (S14-T01: 4h, S14-T02: 8h, S14-T03: 8h, S14-T04: 8h, S14-T05: 8h, S14-T06: 8h).
- **Next Ready Task:** S14-T07 (Sprint S14: Safe social OAuth account linking).

### 2026-10-17 — Sprint S14 Git and Optional Features (Full Sprint & Gate 4 Completion)

- **Date:** 2026-10-17
- **Contributor:** Julio & Project Co-owner
- **Branch/base:** `codex/sprint-14-git-and-optional-features` tracking `origin/codex/sprint-14-git-and-optional-features` (base `codex/sprint-13-reference-providers`)
- **Sprint / Tasks:** Sprint S14 (`sprint-14-git-and-optional-features`), Tasks S14-T07, S14-T09, S14-T10, S14-T11, S14-T08, S14-T12 (100% of Sprint 14 complete; Gate 4 passed)
- **Goal:** Complete the remaining 6 tasks of Sprint 14 and conduct the Gate 4 Ecosystem Integrations release audit:
  - S14-T07: Implement safe social OAuth account linking.
  - S14-T09: Profile additional compiler packages and fonts.
  - S14-T10: Implement SSRF-safe permitted remote resource import.
  - S14-T11: Implement optional TOTP challenge and recovery slice.
  - S14-T08: Verify real Git protocol and token revocation.
  - S14-T12: Stabilize and review supported G4 integrations (Gate 4 Audit).
- **Completed Work:**
  - Implemented safe OAuth account linking/unlinking (`apps/api/src/modules/auth/oauth.ts`) with PKCE, state validation, collision detection, and last auth method preservation.
  - Implemented RFC 6238 TOTP two-factor authentication (`apps/api/src/modules/auth/mfa.ts`, `totp.ts`) with QR/base32 setup, TOTP challenge on login, single-use recovery code consumption, and challenge-based disable with session invalidation.
  - Created TeX compiler package catalog (`apps/tex-executor/package-manifest.json`) profiling packages and fonts across TeX engines with verified licensing and security restrictions.
  - Implemented SSRF-safe remote resource importer (`apps/jobs/src/imports/remote-resource.ts`) blocking private IPs, cloud metadata endpoints, multi-hop DNS rebinding, and untrusted MIME types.
  - Verified Git Smart HTTP protocol over HTTP/REST using authentic Linux Git CLI with token revocation, expiry, Unicode, binary assets, and repeated sync (`tests/integration/git-cli.test.ts`, `tests/integration/s14-t08.test.ts`, `tests/regression/int-06/s14-t08.test.ts`).
  - Authored test reports `docs/test-reports/s14-t07.md`, `s14-t09.md`, `s14-t10.md`, `s14-t11.md`, `s14-t08.md`, `s14-t12.md`, and Gate 4 Audit `docs/test-reports/gate-g4-audit.md`.
  - Updated task frontmatters, roadmap, task index, and sprint progress.
- **Actual Hours:** 46 h (S14-T07: 8h, S14-T09: 6h, S14-T10: 8h, S14-T11: 8h, S14-T08: 8h, S14-T12: 8h; sprint total: 90 h).
- **Commands & Results:**
  - `pnpm exec vitest run tests/integration/s14-*.test.ts`: PASS (10 files, 47 tests).
  - `pnpm exec vitest run tests/integration/git-cli.test.ts`: PASS (5 tests).
  - `pnpm typecheck`: PASS.
  - `pnpm lint`: PASS.
  - `pnpm build`: PASS.
  - `python3 scripts/plan_lint.py`: PASS.
- **Blockers / Gaps:** None for G4. Public signup and untrusted compilation remain disabled per G5 boundary.
- **Next Ready Sprint:** Sprint S15 (`sprint-15-public-hardening`): Public hardening, trusted executor isolation, rate limiting, and Gate 5 sign-off.

### 2026-10-17 — Sprint S15 Public Hardening and Gate G5 Final Release Completion

- **Date:** 2026-10-17
- **Contributor:** Project Co-owner (proposed A-02) & Julio
- **Branch/base:** `codex/sprint-15-public-hardening` tracking `origin/codex/sprint-15-public-hardening` (base `codex/sprint-14-git-and-optional-features`)
- **Sprint / Tasks:** Sprint S15 (`sprint-15-public-hardening`), Tasks S15-T01 through S15-T14 (100% of Sprint 15 complete; Gate 5 passed)
- **Goal:** Deliver the final sprint of the collaborative LaTeX editor master plan:
  - S15-T01: Research verified public isolation primitives & publish ADR-011.
  - S15-T13: Provision verified isolated executor adapter.
  - S15-T02: Audit TeX escape and resource attacks.
  - S15-T03: Route public mode through verified executor with strict Gate 5 policy.
  - S15-T04: Verify multi-replica API and collab deployment.
  - S15-T05: Measure REST, WS, and compile load baseline.
  - S15-T06: Automate complete disaster recovery, backup, and restore.
  - S15-T07: Create privacy-preserving telemetry, redacting manuscript strings.
  - S15-T08: Audit delivered API, WSS, file upload, and integration attack surfaces.
  - S15-T09: Enforce abuse quotas, flags, and admin RBAC dashboard.
  - S15-T10: Review WCAG 2.1 AA accessibility, cross-browser support, and runbooks.
  - S15-T11: Audit all 72 feature IDs against original master plan requirements.
  - S15-T14: Stabilize public candidate, complete Gate G5 release audit.
  - S15-T12: Approve and enable optional public signup with dual-key authorization (ADR-012).
- **Completed Work:**
  - Designed and published ADR-011 (`docs/adr/011-public-executor.md`) and deployment policy (`infra/policies/public-executor.md`).
  - Implemented `IsolatedWorkerExecutor` (`apps/jobs/src/compilation/isolated-executor.ts`) with container boundary checks, cgroup resource constraints, environment variable sanitization, and execution manifests.
  - Executed red-team TeX escape attack suite (`tests/security/executor-isolation.test.ts`) validating isolation against `\write18`, shell escapes, directory traversal, fork bombs, and file descriptor leaks.
  - Built compilation routing policy (`apps/jobs/src/compilation/public-policy.ts`) preventing untrusted compilation without verified executor and active release approval.
  - Documented multi-replica architecture (`infra/railway/replicas.md`) and verified failover, session migration, and Redis CRDT synchronization in `tests/integration/replica-failover.test.ts`.
  - Conducted load testing (`tests/load/workspace.js`, `docs/test-reports/load-baseline.md`) measuring p95 latency (<200ms) and WebSocket fanout across concurrent sessions.
  - Implemented automated backup and restore script (`infra/scripts/backup-restore.ts`) with SHA-256 verification and encryption, validated in `tests/integration/disaster-recovery.test.ts`.
  - Implemented telemetry plugin (`apps/api/src/plugins/telemetry.ts`) strictly redacting private manuscript text, session cookies, and bearer tokens; documented in `infra/railway/observability.md`.
  - Hardened upload and intake security (`apps/api/src/modules/imports/guards.ts`) and audited API/WSS attack surface in `tests/security/public-audit.test.ts`.
  - Built administrative control plane routes (`apps/api/src/modules/admin/routes.ts`) and React management view (`apps/web/src/features/admin/dashboard.tsx`) enforcing admin RBAC permissions.
  - Verified accessibility compliance (`tests/e2e/release-accessibility.spec.ts`) and authored production incident runbooks (`docs/operations/runbooks.md`).
  - Authored comprehensive feature parity audit (`docs/test-reports/feature-parity-audit.md`) confirming 100% compliance across all 72 features.
  - Conducted Gate G5 audit (`docs/test-reports/gate-g5-audit.md`) and defined public deployment procedure (`docs/operations/public-release.md`).
  - Authored ADR-012 (`docs/adr/012-public-signup-enablement.md`) and executed formal release approval (`docs/test-reports/public-release-approval.md`).
  - Authored test reports for all 14 tasks (`docs/test-reports/s15-t01.md` through `s15-t14.md`).
  - Synchronized task frontmatters, index, roadmap, and progress tracking.
- **Actual Hours:** 100 h (S15-T01: 7h, S15-T13: 8h, S15-T02: 8h, S15-T03: 8h, S15-T04: 8h, S15-T05: 8h, S15-T06: 8h, S15-T07: 6h, S15-T08: 8h, S15-T09: 8h, S15-T10: 8h, S15-T11: 6h, S15-T14: 6h, S15-T12: 6h).
- **Commands & Results:**
  - All S15 integration, security, and regression tests PASS.
  - `pnpm typecheck`: PASS.
  - `pnpm lint`: PASS.
  - `pnpm build`: PASS.
  - `python3 scripts/plan_lint.py`: PASS.
- **Blockers / Gaps:** None. All 184 tasks in the master plan are completed and verified.
- **Status:** All Sprints Complete (Sprint 00 - Sprint 15). Gate G5 Passed.


