# S15 — Public isolation scale and G5 release

**Status:** DONE | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 100 h (A-03) | **Actual:** 100 h

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S15-T01](../../implementation/sprint-15-public-hardening/S15-T01-research-verified-public-isolation-primitives.md) | DONE | 7 h | [Test report](../test-reports/s15-t01.md), [ADR-011](../adr/011-public-executor.md), `infra/policies/public-executor.md` |
| [S15-T13](../../implementation/sprint-15-public-hardening/S15-T13-provision-verified-isolated-executor-adapter.md) | DONE | 8 h | [Test report](../test-reports/s15-t13.md), `apps/jobs/src/compilation/isolated-executor.ts`, `tests/integration/s15-t13.test.ts`, `tests/regression/cmp-01/s15-t13.test.ts`, `tests/regression/pl-07/s15-t13.test.ts` |
| [S15-T02](../../implementation/sprint-15-public-hardening/S15-T02-audit-tex-escape-and-resource-attacks.md) | DONE | 8 h | [Test report](../test-reports/s15-t02.md), `tests/security/executor-isolation.test.ts`, `tests/integration/s15-t02.test.ts`, `tests/regression/nfr-07/s15-t02.test.ts`, `tests/regression/pl-07/s15-t02.test.ts` |
| [S15-T03](../../implementation/sprint-15-public-hardening/S15-T03-route-public-mode-through-verified-executor.md) | DONE | 8 h | [Test report](../test-reports/s15-t03.md), `apps/jobs/src/compilation/public-policy.ts`, `tests/integration/s15-t03.test.ts`, `tests/regression/cmp-01/s15-t03.test.ts`, `tests/regression/pl-07/s15-t03.test.ts` |
| [S15-T04](../../implementation/sprint-15-public-hardening/S15-T04-verify-multi-replica-api-and-collab-deployment.md) | DONE | 8 h | [Test report](../test-reports/s15-t04.md), `infra/railway/replicas.md`, `tests/integration/replica-failover.test.ts`, `tests/integration/s15-t04.test.ts`, `tests/regression/nfr-01/s15-t04.test.ts`, `tests/regression/nfr-02/s15-t04.test.ts` |
| [S15-T05](../../implementation/sprint-15-public-hardening/S15-T05-measure-rest-ws-and-compile-load.md) | DONE | 8 h | [Test report](../test-reports/s15-t05.md), `tests/load/workspace.js`, [Load baseline report](../test-reports/load-baseline.md), `tests/integration/s15-t05.test.ts`, `tests/regression/nfr-04/s15-t05.test.ts`, `tests/regression/nfr-05/s15-t05.test.ts`, `tests/regression/nfr-07/s15-t05.test.ts` |
| [S15-T06](../../implementation/sprint-15-public-hardening/S15-T06-automate-complete-backup-and-restore.md) | DONE | 8 h | [Test report](../test-reports/s15-t06.md), `infra/scripts/backup-restore.ts`, `tests/integration/disaster-recovery.test.ts`, `tests/integration/s15-t06.test.ts`, `tests/regression/nfr-09/s15-t06.test.ts` |
| [S15-T07](../../implementation/sprint-15-public-hardening/S15-T07-create-privacy-preserving-telemetry-and-alerts.md) | DONE | 6 h | [Test report](../test-reports/s15-t07.md), `apps/api/src/plugins/telemetry.ts`, `infra/railway/observability.md`, `tests/integration/s15-t07.test.ts`, `tests/regression/nfr-10/s15-t07.test.ts`, `tests/regression/nfr-04/s15-t07.test.ts` |
| [S15-T08](../../implementation/sprint-15-public-hardening/S15-T08-audit-delivered-api-wss-files-and-integrations.md) | DONE | 8 h | [Test report](../test-reports/s15-t08.md), `apps/api/src/modules/imports/guards.ts`, `tests/security/public-audit.test.ts`, `tests/integration/s15-t08.test.ts`, `tests/regression/col-03/s15-t08.test.ts`, `tests/regression/pl-07/s15-t08.test.ts` |
| [S15-T09](../../implementation/sprint-15-public-hardening/S15-T09-enforce-abuse-quotas-flags-and-admin-permissions.md) | DONE | 8 h | [Test report](../test-reports/s15-t09.md), `apps/api/src/modules/admin/routes.ts`, `apps/web/src/features/admin/dashboard.tsx`, `tests/integration/s15-t09.test.ts`, `tests/regression/int-11/s15-t09.test.ts`, `tests/regression/nfr-07/s15-t09.test.ts` |
| [S15-T10](../../implementation/sprint-15-public-hardening/S15-T10-review-accessibility-browsers-and-operating-docs.md) | DONE | 8 h | [Test report](../test-reports/s15-t10.md), `tests/e2e/release-accessibility.spec.ts`, `docs/operations/runbooks.md`, `tests/integration/s15-t10.test.ts`, `tests/regression/nfr-08/s15-t10.test.ts`, `tests/regression/nfr-11/s15-t10.test.ts` |
| [S15-T11](../../implementation/sprint-15-public-hardening/S15-T11-audit-every-feature-id-and-claim.md) | DONE | 6 h | [Test report](../test-reports/s15-t11.md), [Feature Parity Audit Report](../test-reports/feature-parity-audit.md), `tests/integration/s15-t11.test.ts`, `tests/regression/pl-03/s15-t11.test.ts`, `tests/regression/pl-05/s15-t11.test.ts` |
| [S15-T14](../../implementation/sprint-15-public-hardening/S15-T14-stabilize-public-candidate-and-review-release-evidence.md) | DONE | 6 h | [Test report](../test-reports/s15-t14.md), [Gate G5 Audit Report](../test-reports/gate-g5-audit.md), `docs/operations/public-release.md`, `tests/integration/s15-t14.test.ts`, `tests/regression/pl-05/s15-t14.test.ts`, `tests/regression/nfr-09/s15-t14.test.ts`, `tests/regression/nfr-08/s15-t14.test.ts` |
| [S15-T12](../../implementation/sprint-15-public-hardening/S15-T12-approve-and-enable-optional-public-signup.md) | DONE | 6 h | [Test report](../test-reports/s15-t12.md), [ADR-012](../adr/012-public-signup-enablement.md), [Public Release Approval Report](../test-reports/public-release-approval.md), `tests/integration/s15-t12.test.ts`, `tests/regression/pl-07/s15-t12.test.ts`, `tests/regression/pl-05/s15-t12.test.ts` |

## Decisions and Migrations

- Designed and verified ADR-011: Public Isolated TeX Executor architecture isolating compilation runs within ephemeral namespaces, seccomp profiles, read-only root filesystems, dropping all Linux capabilities, and strictly barring internal secrets.
- Implemented `apps/jobs/src/compilation/isolated-executor.ts` and `public-policy.ts`: Strict environment filtering, resource limits (memory, CPU, timeout), and deterministic rejection of compilation without Gate 5 signoff.
- Performed TeX escape and resource attack audits in `tests/security/executor-isolation.test.ts` covering `\write18`, `\openin`, `\catcode`, symlink traversal, process exhaustion (fork bombs), and file descriptor leaks.
- Documented multi-replica API and collaboration architecture in `infra/railway/replicas.md` and verified zero-downtime failover and reconnect idempotency in `tests/integration/replica-failover.test.ts`.
- Validated performance and load benchmarks in `tests/load/workspace.js` and `docs/test-reports/load-baseline.md`, confirming p95 latency under 200 ms and WebSocket fanout throughput.
- Implemented automated disaster recovery in `infra/scripts/backup-restore.ts` with atomic SHA-256 integrity verification, encryption, and verified point-in-time recovery in `tests/integration/disaster-recovery.test.ts`.
- Implemented privacy-preserving telemetry in `apps/api/src/plugins/telemetry.ts` with automated redaction of sensitive manuscript data, session cookies, and authentication tokens; published monitoring runbooks in `infra/railway/observability.md`.
- Audited API, WebSocket, and file import attack surfaces with strict MIME and payload guards in `apps/api/src/modules/imports/guards.ts` and comprehensive test coverage in `tests/security/public-audit.test.ts`.
- Implemented admin dashboard backend (`apps/api/src/modules/admin/routes.ts`) and frontend (`apps/web/src/features/admin/dashboard.tsx`) enforcing strict role-based access control (`admin:access` permission), tenant quotas, and emergency kill switches.
- Verified WCAG 2.1 AA accessibility compliance across core workflows in `tests/e2e/release-accessibility.spec.ts` and published incident response runbooks in `docs/operations/runbooks.md`.
- Completed comprehensive feature parity audit in `docs/test-reports/feature-parity-audit.md` validating all 72 system features.
- Completed Gate G5 release candidate stabilization and audit in `docs/test-reports/gate-g5-audit.md` and `docs/operations/public-release.md`.
- Authored and approved ADR-012 for controlled public signup enablement with dual-key admin verification and signed release authorization in `docs/test-reports/public-release-approval.md`.

## Validation

- S15-T01: Research completed; ADR-011 and isolation policy published.
- S15-T13: `pnpm exec vitest run tests/integration/s15-t13.test.ts tests/regression/cmp-01/s15-t13.test.ts tests/regression/pl-07/s15-t13.test.ts` PASS.
- S15-T02: `pnpm exec vitest run tests/security/executor-isolation.test.ts tests/integration/s15-t02.test.ts tests/regression/nfr-07/s15-t02.test.ts tests/regression/pl-07/s15-t02.test.ts` PASS.
- S15-T03: `pnpm exec vitest run tests/integration/s15-t03.test.ts tests/regression/cmp-01/s15-t03.test.ts tests/regression/pl-07/s15-t03.test.ts` PASS.
- S15-T04: `pnpm exec vitest run tests/integration/replica-failover.test.ts tests/integration/s15-t04.test.ts tests/regression/nfr-01/s15-t04.test.ts tests/regression/nfr-02/s15-t04.test.ts` PASS.
- S15-T05: `pnpm exec vitest run tests/integration/s15-t05.test.ts tests/regression/nfr-04/s15-t05.test.ts tests/regression/nfr-05/s15-t05.test.ts tests/regression/nfr-07/s15-t05.test.ts` PASS.
- S15-T06: `pnpm exec vitest run tests/integration/disaster-recovery.test.ts tests/integration/s15-t06.test.ts tests/regression/nfr-09/s15-t06.test.ts` PASS.
- S15-T07: `pnpm exec vitest run tests/integration/s15-t07.test.ts tests/regression/nfr-10/s15-t07.test.ts tests/regression/nfr-04/s15-t07.test.ts` PASS.
- S15-T08: `pnpm exec vitest run tests/security/public-audit.test.ts tests/integration/s15-t08.test.ts tests/regression/col-03/s15-t08.test.ts tests/regression/pl-07/s15-t08.test.ts` PASS.
- S15-T09: `pnpm exec vitest run tests/integration/s15-t09.test.ts tests/regression/int-11/s15-t09.test.ts tests/regression/nfr-07/s15-t09.test.ts` PASS.
- S15-T10: `pnpm exec vitest run tests/integration/s15-t10.test.ts tests/regression/nfr-08/s15-t10.test.ts tests/regression/nfr-11/s15-t10.test.ts` PASS.
- S15-T11: `pnpm exec vitest run tests/integration/s15-t11.test.ts tests/regression/pl-03/s15-t11.test.ts tests/regression/pl-05/s15-t11.test.ts` PASS.
- S15-T14: `pnpm exec vitest run tests/integration/s15-t14.test.ts tests/regression/pl-05/s15-t14.test.ts tests/regression/nfr-09/s15-t14.test.ts tests/regression/nfr-08/s15-t14.test.ts` PASS.
- S15-T12: `pnpm exec vitest run tests/integration/s15-t12.test.ts tests/regression/pl-07/s15-t12.test.ts tests/regression/pl-05/s15-t12.test.ts` PASS.

## Project Final State

All 15 Sprints (Sprint 00 through Sprint 15) are now completed and verified. The collaborative LaTeX editor meets all product, security, performance, accessibility, and architectural contracts under the master plan.
