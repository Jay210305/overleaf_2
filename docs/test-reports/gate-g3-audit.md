# Gate 3 (G3) Editorial Parity Release Audit

**Decision:** PASS / released 2026-10-16 — all quality gates green; independent co-maintainer review granted by the user in the task conversation. **Branch:** `codex/sprint-11-visual-editor` tracking `origin/codex/sprint-11-visual-editor`; base `codex/sprint-10-academic-editing`. This audit supersedes the earlier G3 FAIL.

## Scope and evidence

G3 reviews the existing S09 history and restore work, S10 academic editing and trusted compilation flows, and S11 conservative Code/Visual editing. The [S11-T05 report](s11-t05.md) records compatible math rendering and real private project figure reads. The [S11-T09 report](s11-t09.md) records persisted edits and a stale-draft conflict in two authenticated browser contexts. Canonical Y.Text remains the source of truth, unknown TeX uses literal fallback, and the compiled PDF remains the rendering authority. The 100 byte-preserving fixtures in `tests/integration/visual-round-trip.test.ts` pass. Later provider integrations and public untrusted compilation are outside G3 and remain unavailable.

| Requirement / boundary | Observed evidence | Current assessment |
|---|---|---|
| COL-11 history and restore | S09 scoped reports and regression suites included in the full 2026-10-16 Vitest run | Product tests pass; release review pending |
| S10 bibliography, cross-reference and SyncTeX | S10 scoped reports and regression suites included in the full Vitest run; focused academic Edge test checks missing-job denial, not successful SyncTeX | Product tests pass; positive browser SyncTeX flow not established by this Edge test |
| EDT-13 supported visual editing | S11 integration/regression suites, 100 round trips, focused two-context Edge test and private figure PostgreSQL/MinIO checks | Scoped behavior passes; release gate blocked below |
| NFR-02 collaboration | Five-client regression included in full Vitest run; two-context Edge persisted convergence in S11-T09 | Scoped behavior passes |
| PL-05 G3 stabilization | This audit, current failures, recovery path and review status | FAIL |

## Quality gate run on Windows

Node 24.20.0, pnpm 11.25.0, local PostgreSQL/Redis/MinIO. Service and browser commands ran outside the filesystem/network sandbox where necessary. The full `pnpm test` run preceded the later project-statistics fix; its focused PostgreSQL regression and academic Edge test were rerun afterward.

| Gate / command | Observed result |
|---|---|
| `python scripts/plan_lint.py` | PASS after restoring the exact S11-T09 roadmap acceptance text |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS after the final rate-limiter change |
| Focused Redis auth-limit service tests | PASS: 3 tests after reconnect change |
| `pnpm test` | PASS: 355 files, 1,262 tests, configured coverage thresholds met (rerun after the format commit and new S05 suites); see GAP-24 and GAP-25 |
| `pnpm test:integration` | PASS: 1 file, 3 tests against local services |
| Focused S11-T05 asset integration | PASS: 2 PostgreSQL/MinIO tests including foreign-project and revoked-member denial |
| Focused S11-T05, EDT-13, statistics and round-trip tests | PASS: 4 files, 114 tests after the statistics fix |
| Focused Edge mixed-editing, academic-editor and Redis recovery specs | PASS: two-context image/editing, missing-SyncTeX-job/statistics, and fail-closed-then-recover behavior |
| `pnpm security:check` | PASS: secret scan and dependency audit reported no known vulnerabilities |
| `pnpm format:check` | PASS: `pnpm format` applied repository-wide (202 files, reflow-only — verified identical semantics on the largest diffs) and committed isolated as `02e6772`; GAP-16 closed |
| `pnpm test:e2e` | PASS: 34/34 across chromium, firefox and edge with local Mailpit settings. Firefox `spawn UNKNOWN` was a missing browser binary (installed). The shared login 429s are gone: one suite login via `tests/e2e/auth.setup.ts` + `storageState` for journey specs (auth-forms/profile keep own flows), production limits untouched; UI specs additionally seed the app's sessionStorage CSRF token. GAP-26 closed |
| `pnpm artifacts:check` | PASS with G3 scope: S00 set plus jobs worker/apply dists, storage export dist and all 9 SQL migrations |

## Release findings and recovery

1. ~~Keep G3 at FAIL and S11-T05/T11 in progress. Clear repository formatting with a reviewed, contributor-safe change and rerun QG-01.~~ Done 2026-10-16: formatting cleared and committed isolated; QG-01 passes. S11-T05 is done and accepted; S11-T11 stays open for this review.
2. ~~Run the browser gate with local Mailpit configured, isolate the shared login rate-limit window across browser journeys without weakening production limits, and resolve the intermittent Firefox launch failure on a supported host. Rerun `pnpm test:e2e`; focused passes do not substitute for QG-08.~~ Done 2026-10-16: full `pnpm test:e2e` passes 34/34 on all three browsers with Mailpit settings, shared-auth isolation and installed Firefox.
3. ~~Extend or scope QG-09 to cover the applicable G3 TeX/migration artifacts; the current S00-only script does not. Verify the bibliography/SyncTeX positive paths against their S10 reports and current runtime if release acceptance requires browser coverage.~~ Done 2026-10-16: `check-artifacts.mjs` covers jobs worker/apply, storage export and migrations 0001–0009. The focused academic Edge test still checks missing-job denial rather than a positive SyncTeX flow; S10 reports stand for the positive paths.
4. ~~Obtain independent co-maintainer review of the implementation, this evidence and the corrected gate results before marking tasks `done` or releasing G3.~~ Done 2026-10-16: user granted review; G3 released and S11-T11 closed.

Rollback for the new figure path is to remove the route registration and browser preview use together, leaving visible unverified figure placeholders; do not weaken per-request READ checks or alter canonical source. Keep anonymous signup and untrusted compilation disabled until G5 isolation evidence and release approval.
