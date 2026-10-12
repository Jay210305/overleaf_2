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
| 2026-10-12 | S02-T10 authenticated password change on `feature/identity-permissions` | Not measured | [S02-T10 report](../test-reports/s02-t10.md): PostgreSQL hash replacement, other-session revocation, reset-token invalidation, denial and local gates | Independent co-maintainer review pending; then S02-T11 |


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
