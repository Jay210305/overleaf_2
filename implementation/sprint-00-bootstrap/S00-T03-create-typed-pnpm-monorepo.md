---
id: S00-T03
sprint: 0
owner: "Julio"
effort_h: 6
effort_range_h: [4, 6, 8]
estimate_basis: assumption-a-03
depends_on: [S00-T02]
requirements: [PL-01]
source_task: S00-T03
status: done
readiness: completed
---
# S00-T03 — Create typed pnpm monorepo

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S00 / G1 | Julio (proposed A-02) | 6 (ASSUMPTION A-03) | [S00-T02](S00-T02-write-permanent-agent-execution-rules.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Create typed pnpm monorepo to satisfy the requirement statements below. Original source task: S00-T03; the source ID is preserved; continuation tasks, where present, carry additional independently reviewable slices. Work only this task and its defined interface.

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Preconditions

- Dependencies in the table are completed with evidence.
- Contract schema and a positive/negative fixture are available; required environment/tooling is validated.
- If likely effort exceeds 8 h, split the remaining unstarted work with new never-reused IDs and update the roadmap/index before Ready. The pessimistic range is uncertainty, not an authorized >8 h task.
- No private production data/credentials are needed for local fixture work.

## Interface Contract

- [development-tooling](../../docs/contracts/development-tooling.md)

- **Input:** Existing repository, approved planning baseline and development environment.
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: All apps/packages resolve under pinned pnpm and strict TypeScript with a frozen lockfile install.
- **Errors:** Missing prerequisite exits nonzero; never overwrite contributor changes.
- **Valid example:** Positive-input fixture produces this task's scoped result: All apps/packages resolve under pinned pnpm and strict TypeScript with a frozen lockfile install.
- **Invalid example:** Missing Docker/configuration or secret-bearing browser import fails visibly.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 6 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s00-t03.test.ts for the exact acceptance criteria below; include Missing Docker/configuration or secret-bearing browser import fails visibly. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in package.json using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in pnpm-workspace.yaml and connect the real behavior. |
| 1.4 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `tests/integration/s00-t03.test.ts`
- `tests/regression/pl-01/s00-t03.test.ts`
- `docs/test-reports/s00-t03.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [x] All current apps/packages resolve under pinned pnpm and strict TypeScript with a frozen lockfile install
- [x] PL-01: Reproducible typed monorepo, compatible pinned tooling and startup scripts. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [x] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s00-t03.test.ts tests/regression/pl-01/s00-t03.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Run relevant integration/browser/security checks from QG-05/QG-07/QG-08/QG-09; include real PG/Redis/storage or trusted compiler when this boundary needs it. Record command, environment, actual output and actual hours in the report; listed commands are not execution evidence.

## Edge Cases & Pitfalls

Missing Docker/configuration or secret-bearing browser import fails visibly. Missing prerequisite exits nonzero; never overwrite contributor changes. Exercise denied roles/foreign IDs and retry/failure boundaries when applicable. For documentation/research, distinguish measured facts, proposals and missing external evidence.

## Risks / Scope Cuts

Re-estimate if actual effort exceeds the likely estimate by 50% or the same blocker lasts two work sessions. Keep durable data, ACLs, privacy and authentic output. Defer optional UI breadth/provider/advanced support in the ordered roadmap cuts. If a required boundary cannot be validated, keep this task blocked and do not silently shrink its acceptance.

## Definition of Done

- [x] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [x] Dependencies/contracts and applicable shared quality gates pass.
- [x] Runtime behavior is real, permission-checked and persistent when applicable.
- [x] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [x] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [x] Independent co-maintainer review complete; status updated to done only after evidence.
