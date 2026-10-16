# Gate 3 (G3) Editorial Parity Release Audit

**Decision:** FAIL / release held, 2026-10-16. **Branch:** `codex/sprint-11-visual-editor` tracking `origin/codex/sprint-11-visual-editor`; base `codex/sprint-10-academic-editing`. **Independent co-maintainer review:** pending. This audit supersedes the earlier G3 PASS claims.

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
| `pnpm test` | PASS: 335 files, 1,205 tests, configured coverage thresholds met after serializing Vitest suites; see GAP-24 and GAP-25 |
| `pnpm test:integration` | PASS: 1 file, 3 tests against local services |
| Focused S11-T05 asset integration | PASS: 2 PostgreSQL/MinIO tests including foreign-project and revoked-member denial |
| Focused S11-T05, EDT-13, statistics and round-trip tests | PASS: 4 files, 114 tests after the statistics fix |
| Focused Edge mixed-editing, academic-editor and Redis recovery specs | PASS: two-context image/editing, missing-SyncTeX-job/statistics, and fail-closed-then-recover behavior |
| `pnpm security:check` | PASS: secret scan and dependency audit reported no known vulnerabilities |
| `pnpm format:check` | FAIL: 177 inherited files on the latest run; GAP-16 remains open |
| `pnpm test:e2e` | FAIL: latest run with repository example Mailpit settings passed 20/33. Firefox intermittently reported `spawn UNKNOWN`. Shared login rate limiting returned 429 in later project-tree/upload journeys; this was confirmed in the Chromium Playwright trace. Earlier runs without SMTP settings also returned 503 for registration. These are separate environment/harness failures; the complete QG-08 gate has not passed |
| `pnpm artifacts:check` | Script PASS, but it checks S00 browser/API/shared-package artifacts only and reports no TeX or migration artifacts; G3 artifact coverage is not established by this script |

## Release findings and recovery

1. Keep G3 at FAIL and S11-T05/T11 in progress. Clear repository formatting with a reviewed, contributor-safe change and rerun QG-01.
2. Run the browser gate with local Mailpit configured, isolate the shared login rate-limit window across browser journeys without weakening production limits, and resolve the intermittent Firefox launch failure on a supported host. Rerun `pnpm test:e2e`; focused passes do not substitute for QG-08.
3. Extend or scope QG-09 to cover the applicable G3 TeX/migration artifacts; the current S00-only script does not. Verify the bibliography/SyncTeX positive paths against their S10 reports and current runtime if release acceptance requires browser coverage.
4. Obtain independent co-maintainer review of the implementation, this evidence and the corrected gate results before marking tasks `done` or releasing G3.

Rollback for the new figure path is to remove the route registration and browser preview use together, leaving visible unverified figure placeholders; do not weaken per-request READ checks or alter canonical source. Keep anonymous signup and untrusted compilation disabled until G5 isolation evidence and release approval.
