# S06 — Trusted compilation and G1 release

**Status:** COMPLETED | **Owner:** Julio (proposed A-02) | **Estimate:** 124 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S06-T01](../../implementation/sprint-06-trusted-compilation/S06-T01-create-durable-compile-queue-jobs.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t01.md); Idempotency-Key and recovery verified |
| [S06-T02](../../implementation/sprint-06-trusted-compilation/S06-T02-freeze-compilation-source-revision.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t02.md); immutable manifest hash binding verified |
| [S06-T12](../../implementation/sprint-06-trusted-compilation/S06-T12-research-trusted-tex-runtime-and-image-limits.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t12.md); [ADR spike](../adr/trusted-runtime-spike.md) verified |
| [S06-T03](../../implementation/sprint-06-trusted-compilation/S06-T03-build-pinned-tex-live-image.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t03.md); TeX Live Dockerfile and texmf.cnf verified |
| [S06-T04](../../implementation/sprint-06-trusted-compilation/S06-T04-define-compiler-executor-boundary.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t04.md); typed CompilerExecutor contract verified |
| [S06-T13](../../implementation/sprint-06-trusted-compilation/S06-T13-implement-trusted-worker-executor-adapter.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t13.md); separate worker executor adapter verified |
| [S06-T05](../../implementation/sprint-06-trusted-compilation/S06-T05-enforce-trusted-compiler-execution-limits.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t05.md); 60s timeout, no-shell-escape, cleanup verified |
| [S06-T14](../../implementation/sprint-06-trusted-compilation/S06-T14-implement-timeout-cancellation-and-job-recovery.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t14.md); timeout and job recovery reconciliation verified |
| [S06-T06](../../implementation/sprint-06-trusted-compilation/S06-T06-persist-verified-artifacts-and-job-result.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t06.md); private artifact persistence & S3 retention verified |
| [S06-T07](../../implementation/sprint-06-trusted-compilation/S06-T07-parse-diagnostics-and-compile-failures.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t07.md); error/warning diagnostic parser & path redaction verified |
| [S06-T08](../../implementation/sprint-06-trusted-compilation/S06-T08-create-real-pdf-viewer.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t08.md); real PDF viewer with zoom/page controls verified |
| [S06-T09](../../implementation/sprint-06-trusted-compilation/S06-T09-connect-compile-controls-and-status-fallback.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t09.md); compile button, polling & hotkeys verified |
| [S06-T10](../../implementation/sprint-06-trusted-compilation/S06-T10-verify-genuine-compiler-fixtures.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t10.md); genuine PDF fixture outputs verified |
| [S06-T11](../../implementation/sprint-06-trusted-compilation/S06-T11-document-trusted-execution-and-closed-public-mode.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t11.md); closed public mode & runbooks verified |
| [S06-T15](../../implementation/sprint-06-trusted-compilation/S06-T15-deploy-trusted-staging-slice-and-smoke.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t15.md); [Staging deployment report](../test-reports/g1-deploy.md) verified |
| [S06-T16](../../implementation/sprint-06-trusted-compilation/S06-T16-verify-trusted-release-backup-and-rollback.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t16.md); backup & restore rollback script verified |
| [S06-T17](../../implementation/sprint-06-trusted-compilation/S06-T17-stabilize-and-review-g1-release.md) | DONE | Not measured | [Scoped test report](../test-reports/s06-t17.md); [Gate G1 Audit](../test-reports/gate-g1-audit.md) verified |

## Decisions and Migrations

- Dedicated branch `codex/sprint-06-trusted-compilation` tracking `origin/codex/sprint-06-trusted-compilation`.
- Added migration `0008-compile-jobs.sql` providing durable compile jobs, revision binding, diagnostic persistence, and artifact relations.
- Implemented `CompilationsRepository` with idempotent enqueueing, concurrency limits (1 active compile per user/project), and transactional status transitions.
- Revision freezing snapshot mechanism `freezeCompilationRevision` binds immutable snapshot hashes before dispatching jobs.
- Packaged TeX Live environment in `apps/tex-executor` with restricted `texmf.cnf` (`openin_any = p`, `openout_any = p`, `shell_escape = f`).
- Implemented `TrustedWorkerExecutor` separating compiler from API/WebSocket servers; zero secrets/database credentials are exposed to TeX runtime.
- Built `@latex-collab/latex` diagnostic parser (`parseTeXLog`) with path redaction to prevent local container filesystem disclosure.
- Built React PDF viewer `apps/web/src/features/pdf/pdf-viewer.tsx` with page navigation, zoom, download, and fallback states.
- Implemented compile controls and keyboard shortcuts (`Ctrl+Enter` / `Cmd+Enter`) in `apps/web/src/features/compilation/compile-controls.tsx`.
- Automated backup & recovery drill script in `infra/scripts/trusted-backup.ts` proving zero loss of referenced blobs.
- Enforced closed public mode (`PUBLIC_SIGNUP_ENABLED=false`, `UNTRUSTED_COMPILE_ENABLED=false`) until Gate 5 / Sprint 15.

## Validation

- Focused test suites across all 17 tasks: 48 test files, 105 tests PASS.
- Monorepo checks:
  - `pnpm typecheck`: PASS (0 errors across all apps and packages).
  - `pnpm lint`: PASS (0 errors).
  - `pnpm build`: PASS (all apps and packages build cleanly).
  - `python scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages).
- Gate 1 audit passed with full compliance to Quality Gates QG-01 through QG-10.

## Risks and Debt

- Public untrusted compilation remains strictly disabled (`UNTRUSTED_COMPILE_ENABLED=false`) until Sprint 15 (Gate 5) provides audited Firecracker/gVisor microVM isolation.
- Public user registration remains disabled (`PUBLIC_SIGNUP_ENABLED=false`) until Gate 5.
- TeX Live pinned image requires local Docker daemon or configured remote trusted worker instance for production execution.

## Next Task

Sprint 06 is fully verified, closed, and audited. Ready to proceed to Sprint 07 (`sprint-07-durable-collaboration`).
