---
id: S15-T14
sprint: 15
owner: "Project Co-owner"
effort_h: 8
effort_range_h: [6, 8, 10]
estimate_basis: assumption-a-03
depends_on: [S15-T11]
requirements: [PL-05, NFR-09, NFR-08]
source_task: S15-T11
status: todo
readiness: pending-dependencies
---
# S15-T14 — Stabilize public candidate and review release evidence

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S15 / G5 | Project Co-owner (proposed A-02) | 8 (ASSUMPTION A-03) | [S15-T11](S15-T11-audit-every-feature-id-and-claim.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Stabilize public candidate and review release evidence to satisfy the requirement statements below. Original source task: S15-T11; this additional slice closes a missing requirement or splits the broader source scope. Work only this task and its defined interface.

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Preconditions

- Dependencies in the table are completed with evidence.
- Establish the task review checklist and inspect available evidence. Repository discovery records missing tools as findings; research validates only its necessary tooling; release review requires the real prior implementation reports.
- If likely effort exceeds 8 h, split the remaining unstarted work with new never-reused IDs and update the roadmap/index before Ready. The pessimistic range is uncertainty, not an authorized >8 h task.
- Research must validate provider/protocol capabilities and licenses; credentialed work requires authorized test accounts. Missing access is BLOCKED_BY_CREDENTIALS or BLOCKED_BY_PROVIDER.

## Interface Contract

- [compilation](../../docs/contracts/compilation.md)
- [development-tooling](../../docs/contracts/development-tooling.md)
- [http-api](../../docs/contracts/http-api.md)

- **Input:** Repository/context and contract or actual test evidence needed for Stabilize public candidate and review release evidence.
- **Output:** `docs/test-reports/gate-g5-audit.md`, `docs/operations/public-release.md` with the scoped acceptance review.
- **Errors:** Missing factual evidence/access remains explicitly blocked; no invented versions, credentials, measurements or approvals.
- **Valid example:** The stated review criterion is met with cited/recorded evidence, or a research spike honestly records a blocked outcome. A release review can pass only with actual passing product evidence.
- **Invalid example:** Claiming an implementation, provider capability or human approval from a written plan alone fails review.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Review criteria precede the documentation/decision. Each step is <=2 h; the hours sum to 8 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 2 | Define the release/review checklist for: Security/restore/load/accessibility audit records actual outputs and rollback; all G5 Musts meet gates before public approval task; pin the declared gate scope. |
| 1.2 | 2 | Run the existing relevant product checks and collect real reports; missing evidence is FAIL/BLOCKED, not a fictional green result. |
| 1.3 | 2 | Record findings, criteria, supported scope and rollback/recovery in docs/test-reports/gate-g5-audit.md, docs/operations/public-release.md. |
| 1.4 | 2 | Review all evidence with co-maintainer, rerun checks affected by fixes, update status/progress and actual hours. |

## Deliverables

- `docs/test-reports/gate-g5-audit.md`
- `docs/operations/public-release.md`
- `docs/test-reports/s15-t14.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [ ] Security/restore/load/accessibility audit records actual outputs and rollback; all G5 Musts meet gates before public approval task
- [ ] PL-05: Walking skeleton and stabilized current-gate release with documented findings. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] NFR-09: Restore DB and object backups consistently before hosted release; automate in G5. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] NFR-08: WCAG 2.2 AA target: axe checks plus manual keyboard review for delivered scope. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

Run the structural check and review every acceptance item against evidence. This is a release/feature audit: run existing relevant product suites; do not create replacement fake tests. Missing prerequisites or failures block PASS.

```text
python scripts/plan_lint.py
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm security:check
```

Record command/environment/results, source links or review findings and actual hours in `docs/test-reports/s15-t14.md`. A listed command or proposed contract is not execution evidence.

## Edge Cases & Pitfalls

Distinguish measured facts from design proposals; preserve contributor files and stable IDs. Missing access/research is blocked. An unavailable provider or unverified executor cannot be declared supported. Discovery records rather than invents weekly availability; actual public enablement requires separate recorded maintainer approval.

## Risks / Scope Cuts

Re-estimate if actual effort exceeds the likely estimate by 50% or the same blocker lasts two work sessions. Keep durable data, ACLs, privacy and authentic output. Defer optional UI breadth/provider/advanced support in the ordered roadmap cuts. If a required boundary cannot be validated, keep this task blocked and do not silently shrink its acceptance.

## Definition of Done

- [ ] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [ ] Dependencies/contracts and applicable shared quality gates pass.
- [ ] Runtime behavior is real, permission-checked and persistent when applicable.
- [ ] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [ ] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [ ] Independent co-maintainer review complete; status updated to done only after evidence.
