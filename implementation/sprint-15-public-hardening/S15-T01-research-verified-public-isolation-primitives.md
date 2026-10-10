---
id: S15-T01
sprint: 15
owner: "Project Co-owner"
effort_h: 4
effort_range_h: [2, 4, 6]
estimate_basis: assumption-a-03
depends_on: [S06-T17, S07-T10, S11-T11, S14-T12]
requirements: [PL-07]
source_task: S15-T01
status: todo
readiness: pending-dependencies
---
# S15-T01 — Research verified public isolation primitives

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S15 / G5 | Project Co-owner (proposed A-02) | 4 (ASSUMPTION A-03) | [S06-T17](../sprint-06-trusted-compilation/S06-T17-stabilize-and-review-g1-release.md), [S07-T10](../sprint-07-durable-collaboration/S07-T10-verify-convergence-failures-and-recovery.md), [S11-T11](../sprint-11-visual-editor/S11-T11-stabilize-and-review-g3-academic-workflow.md), [S14-T12](../sprint-14-git-and-optional-features/S14-T12-stabilize-and-review-supported-g4-integrations.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Research verified public isolation primitives to satisfy the requirement statements below. Original source task: S15-T01; the source ID is preserved; continuation tasks, where present, carry additional independently reviewable slices. Work only this task and its defined interface.

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

- **Input:** Repository/context and contract or actual test evidence needed for Research verified public isolation primitives.
- **Output:** `docs/adr/011-public-executor.md`, `infra/policies/public-executor.md` with the scoped acceptance review.
- **Errors:** Missing factual evidence/access remains explicitly blocked; no invented versions, credentials, measurements or approvals.
- **Valid example:** The stated review criterion is met with cited/recorded evidence, or a research spike honestly records a blocked outcome. A release review can pass only with actual passing product evidence.
- **Invalid example:** Claiming an implementation, provider capability or human approval from a written plan alone fails review.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Review criteria precede the documentation/decision. Each step is <=2 h; the hours sum to 4 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Define the review checklist for: Within 4h document actual provider network/mount/process/resource controls and adversarial test design or block G5; record which evidence is initially absent. |
| 1.2 | 1 | Gather repository/official research/actual gate evidence required by Research verified public isolation primitives; label facts, assumptions and blockers. |
| 1.3 | 1 | Complete docs/adr/011-public-executor.md, infra/policies/public-executor.md within this scope; research spikes stop at 4 active hours and record blocked outcomes. |
| 1.4 | 1 | Review all acceptance items, run the plan consistency check and record actual effort/results. |

## Deliverables

- `docs/adr/011-public-executor.md`
- `infra/policies/public-executor.md`
- `docs/test-reports/s15-t01.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [ ] Within 4h document actual provider network/mount/process/resource controls and adversarial test design or block G5
- [ ] PL-07: Private credentials, no unauthorized code reuse and explicit compiler trust boundary. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

Run the structural check and review every acceptance item against evidence. Documentation/research uses verifiable review criteria; it does not require later product features to exist.

```text
python scripts/plan_lint.py
```

Record command/environment/results, source links or review findings and actual hours in `docs/test-reports/s15-t01.md`. A listed command or proposed contract is not execution evidence.

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
