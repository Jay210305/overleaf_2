---
id: S01-T05
sprint: 1
owner: "Project Co-owner"
effort_h: 8
effort_range_h: [6, 8, 10]
estimate_basis: assumption-a-03
depends_on: [S01-T09]
requirements: [PL-06]
source_task: S01-T05
status: todo
readiness: pending-dependencies
---
# S01-T05 — Implement Zod DTOs and OpenAPI generation

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S01 / G1 | Project Co-owner (proposed A-02) | 8 (ASSUMPTION A-03) | [S01-T09](S01-T09-complete-support-entity-migration-slices.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Implement Zod DTOs and OpenAPI generation to satisfy the requirement statements below. Original source task: S01-T05; the source ID is preserved; continuation tasks, where present, carry additional independently reviewable slices. Work only this task and its defined interface.

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Preconditions

- Dependencies in the table are completed with evidence.
- Contract schema and a positive/negative fixture are available; required environment/tooling is validated.
- If likely effort exceeds 8 h, split the remaining unstarted work with new never-reused IDs and update the roadmap/index before Ready. The pessimistic range is uncertainty, not an authorized >8 h task.
- No private production data/credentials are needed for local fixture work.

## Interface Contract

- [data-model](../../docs/contracts/data-model.md)
- [http-api](../../docs/contracts/http-api.md)
- [storage-and-revisions](../../docs/contracts/storage-and-revisions.md)

- **Input:** Validated SQL/DTOs, UUID/UTC identity and authorized scoped object keys.
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: Input/output validators and generated API agree with planned OpenAPI; database-only fields never reach browser DTOs.
- **Errors:** FK/unique/version/schema failure rolls back; private presign denied.
- **Valid example:** Positive-input fixture produces this task's scoped result: Input/output validators and generated API agree with planned OpenAPI; database-only fields never reach browser DTOs.
- **Invalid example:** Foreign parent, duplicate null-parent root name, invalid DTO or public secret.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 8 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s01-t05.test.ts for the exact acceptance criteria below; include Foreign parent, duplicate null-parent root name, invalid DTO or public secret. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in packages/contracts/src/index.ts using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in docs/api/openapi.json and connect the real behavior. |
| 1.4 | 2 | Start with failing denial/conflict/retry assertions; implement the failure handling needed to satisfy: FK/unique/version/schema failure rolls back; private presign denied. |
| 1.5 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `packages/contracts/src/index.ts`
- `docs/api/openapi.json`
- `tests/integration/s01-t05.test.ts`
- `tests/regression/pl-06/s01-t05.test.ts`
- `docs/test-reports/s01-t05.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [ ] Input/output validators and generated API agree with planned OpenAPI; database-only fields never reach browser DTOs
- [ ] PL-06: Relational constraints, typed contracts and migrations preserve domain invariants. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s01-t05.test.ts tests/regression/pl-06/s01-t05.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Run relevant integration/browser/security checks from QG-05/QG-07/QG-08/QG-09; include real PG/Redis/storage or trusted compiler when this boundary needs it. Record command, environment, actual output and actual hours in the report; listed commands are not execution evidence.

## Edge Cases & Pitfalls

Foreign parent, duplicate null-parent root name, invalid DTO or public secret. FK/unique/version/schema failure rolls back; private presign denied. Exercise denied roles/foreign IDs and retry/failure boundaries when applicable. For documentation/research, distinguish measured facts, proposals and missing external evidence.

## Risks / Scope Cuts

Re-estimate if actual effort exceeds the likely estimate by 50% or the same blocker lasts two work sessions. Keep durable data, ACLs, privacy and authentic output. Defer optional UI breadth/provider/advanced support in the ordered roadmap cuts. If a required boundary cannot be validated, keep this task blocked and do not silently shrink its acceptance.

## Definition of Done

- [ ] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [ ] Dependencies/contracts and applicable shared quality gates pass.
- [ ] Runtime behavior is real, permission-checked and persistent when applicable.
- [ ] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [ ] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [ ] Independent co-maintainer review complete; status updated to done only after evidence.
