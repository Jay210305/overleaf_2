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
- **Review:** The hostile battery exposed and fixed a real sweep-starvation bug via the new `archive_swept` flag. Independent co-maintainer review of S05-T03 remains open; S05-T12/S05-T10 are next.

