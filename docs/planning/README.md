# Planning Package

**Version:** 1.0.0 | **Date:** 2026-10-09 | **Maintainers:** Julio and Project Co-owner

English subdivision using specification → roadmap → task files. Discovery records the two-person extracurricular context, delegated scope, no deadline/fixed budget, unscheduled stages and proposed effort/ownership.

## Numbered Documents

| Document | Responsibility |
|---|---|
| [00 — Discovery](00-discovery.md) | Goal/team/scope/exclusions/assumptions |
| [01 — Overview](01-overview.md) | Product/users/use cases/constraints |
| [02 — Architecture](02-architecture.md) | Components/topology/repo/dependency rules |
| [03 — Technical Spec](03-technical-spec.md) | Contracts/frontend/invariants |
| [04 — Implementation Roadmap](04-implementation-roadmap.md) | Stages/tasks/owners/estimates/dependencies/cuts |
| [05 — Testing](05-testing.md) | Strategy/fixtures/coverage/fault/security |
| [06 — CI/CD and Environments](06-ci-cd-and-environments.md) | Shared quality gates/pipeline/deploy/operations |
| [07 — Risks](07-risks.md) | R1–R14/owners/mitigations/research spikes |
| [08 — Metrics / NFRs](08-metrics-and-nfrs.md) | Thresholds/telemetry/reference measurement |
| [09 — Decisions](09-decisions.md) | ADR context/options/choice/consequences |
| [10 — Glossary and References](10-glossary-and-references.md) | Vocabulary/original research links |

## Supporting Documents

- [Requirements and MoSCoW](requirements.md)
- [Requirement → Task → Test](traceability.md)
- [Stable E2E scenarios](test-scenarios.md)
- [Contracts](../contracts/README.md) / [HTTP operation index](../contracts/http-operations.md)
- [Task index](../../implementation/README.md) / [Feature evidence](../feature-parity.md)
- [Progress](../progress/progress-log.md) / [Open Gaps](../progress/open-gaps.md) / [Debt](../progress/technical-debt.md)
- [Execution guide](execution-guide.md) / [Release and Post-mortem](release-and-postmortem.md)

## Source Coverage

Both inputs remain unchanged. New choices are proposals/ADRs; original detail remains for audit without requiring the full mega document for each task.

| Source section | English destination |
|---|---|
| 0 — Agent instructions | Execution Guide; task index; doc 06 |
| 1 — Product/gates/NFRs | Docs 00/01/08; Requirements |
| 2 — Features/permissions | Requirements; Traceability; HTTP contract |
| 3 — Stack/topology/repo | Doc 02; Decisions; Development Tooling |
| 4 — Data | Data Model; Storage and Revisions |
| 5 — API | HTTP/OpenAPI; operation index |
| 6 — Collaboration | Collaboration contract; S04/S07 |
| 7 — Frontend/UX | Doc 03; acceptance; doc 05 |
| 8 — Compilation | Compilation/Storage; S06/S10/S15 |
| 9 — History/comments/restore | Editing and Review; S08/S09 |
| 10 — Visual | Editing and Review; S11 |
| 11 — Security | Docs 05/07; HTTP/Compilation; S15 |
| 12 — Integrations | Integration contract; S12–S14 |
| 13 — Deploy/operations | Doc 06; Development Tooling; S06/S15 |
| 14 — Tests | Docs 05/06; Test Scenarios |
| 15 — Roadmap | Doc 04; preserved source IDs plus added slices |
| 16 — Execution/prompts/progress | Execution Guide; index; progress |
| 17 — Final checklist | Requirements; release checklist; gate audits |
| 18 — Risks/debt | Doc 07; Open Gaps; Debt |
| 19 — References | Doc 10 |

## Methodology Gates

- [x] Delegated discovery/scope and explicit assumptions recorded.
- [x] Constraints/MoSCoW/specification/contracts/source IDs organized.
- [x] Roadmap/tasks/owners/estimates/atomic steps/index/traceability created.
- [x] Effort reconciled; calendar capacity not applicable to unscheduled stages.
- [x] Cuts/progress/debt structure/release/post-mortem initialized.
- [ ] Research actually performed and affected tasks Ready.
- [ ] Human capacity measured if a future timebox is selected.
- [ ] Application checks/deployment and actual release gates passed.

Run `python scripts/plan_lint.py` to validate documentation structure. This does not establish product readiness or release completion. Actual results are in the [Migration Report](migration-report.md).
