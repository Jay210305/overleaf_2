# S00 — Bootstrap and walking skeleton

**Status:** IN_PROGRESS | **Owner:** Julio (proposed A-02) | **Estimate:** 66 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S00-T01](../../implementation/sprint-00-bootstrap/S00-T01-inspect-repository-and-preserve-contributor-changes.md) | DONE | Not measured | [Repository audit](repository-audit.md), [acceptance review](../test-reports/s00-t01.md); Project Co-owner accepted scoped review 2026-10-10 |
| [S00-T11](../../implementation/sprint-00-bootstrap/S00-T11-check-editor-collaboration-dependency-compatibility.md) | DONE | Not measured | [Compatibility spike](../adr/compatibility-spike.md), [acceptance review](../test-reports/s00-t11.md); Project Co-owner accepted candidate and blocker 2026-10-10 |
| [S00-T02](../../implementation/sprint-00-bootstrap/S00-T02-write-permanent-agent-execution-rules.md) | DONE | Not measured | [Rule acceptance review](../test-reports/s00-t02.md); Project Co-owner accepted 2026-10-10 |
| [S00-T03](../../implementation/sprint-00-bootstrap/S00-T03-create-typed-pnpm-monorepo.md) | DONE | Not measured | [Workspace acceptance report](../test-reports/s00-t03.md); Project Co-owner accepted scoped review 2026-10-10 |
| [S00-T04](../../implementation/sprint-00-bootstrap/S00-T04-create-browser-shell-and-route-providers.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S00-T05](../../implementation/sprint-00-bootstrap/S00-T05-create-api-health-and-error-boundary.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S00-T06](../../implementation/sprint-00-bootstrap/S00-T06-configure-code-quality-and-ci.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S00-T07](../../implementation/sprint-00-bootstrap/S00-T07-create-local-services-and-validated-configuration.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S00-T12](../../implementation/sprint-00-bootstrap/S00-T12-deliver-browser-to-api-walking-skeleton.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S00-T08](../../implementation/sprint-00-bootstrap/S00-T08-record-initial-architecture-decisions.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S00-T09](../../implementation/sprint-00-bootstrap/S00-T09-initialize-feature-and-evidence-inventory.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S00-T10](../../implementation/sprint-00-bootstrap/S00-T10-document-clean-development-startup.md) | NOT_STARTED | Not recorded | No implementation evidence |

## Decisions and Migrations

Repository discovery started in S00-T01. S00-T03 pinned the initial Node/pnpm/TypeScript/tooling versions and generated the first lockfile; no data migration was performed. Planning baseline is in the numbered specification and contracts.

## Validation

S00-T03 workspace test, frozen install, bootstrap lint, typecheck and tooling build results are in its linked report. Browser/API runtime and service checks remain NOT_RUN. Documentation validation for S00-T01, S00-T11 and S00-T02 is recorded in their linked reports.

## Risks and Debt

Track actual findings in Open Gaps and Technical Debt, referencing the task.

## Next Task

S00-T04 is next in the index, subject to its readiness check.
