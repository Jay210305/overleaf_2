---
id: S02-T02
sprint: 2
owner: "Julio"
effort_h: 8
effort_range_h: [6, 8, 10]
estimate_basis: assumption-a-03
depends_on: [S02-T01]
requirements: [ACC-01, ACC-02, COL-03]
source_task: S02-T02
status: in_progress
readiness: implementation-tested-review-pending
---
# S02-T02 — Implement cookie sessions and logout

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S02 / G1 | Julio (proposed A-02) | 8 (ASSUMPTION A-03) | [S02-T01](S02-T01-implement-registration-and-verification.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Implement cookie sessions and logout to satisfy the requirement statements below. Original source task: S02-T02; the source ID is preserved; continuation tasks, where present, carry additional independently reviewable slices. Work only this task and its defined interface.

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Preconditions

- Dependencies in the table are completed with evidence.
- Contract schema and a positive/negative fixture are available; required environment/tooling is validated.
- If likely effort exceeds 8 h, split the remaining unstarted work with new never-reused IDs and update the roadmap/index before Ready. The pessimistic range is uncertainty, not an authorized >8 h task.
- No private production data/credentials are needed for local fixture work.

## Interface Contract

- [http-api](../../docs/contracts/http-api.md)
- [data-model](../../docs/contracts/data-model.md)

- **Input:** Typed auth/profile requests; opaque cookie, current session and CSRF/Origin.
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: Secure host-only cookie, CSRF check, expiry/rotation and logout revocation pass expected 401/403 cases.
- **Errors:** 400 invalid; 401 expired; 403 denied; 429 abuse; indistinguishable forgot response.
- **Valid example:** Positive-input fixture produces this task's scoped result: Secure host-only cookie, CSRF check, expiry/rotation and logout revocation pass expected 401/403 cases.
- **Invalid example:** Forged CSRF, consumed reset token, disabled user or foreign project denied.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 8 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s02-t02.test.ts for the exact acceptance criteria below; include Forged CSRF, consumed reset token, disabled user or foreign project denied. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in apps/api/src/modules/auth/session.ts using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in apps/api/src/plugins/csrf.ts and connect the real behavior. |
| 1.4 | 2 | Start with failing denial/conflict/retry assertions; implement the failure handling needed to satisfy: 400 invalid; 401 expired; 403 denied; 429 abuse; indistinguishable forgot response. |
| 1.5 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `apps/api/src/modules/auth/session.ts`
- `apps/api/src/plugins/csrf.ts`
- `tests/integration/s02-t02.test.ts`
- `tests/regression/acc-01/s02-t02.test.ts`
- `tests/regression/acc-02/s02-t02.test.ts`
- `tests/regression/col-03/s02-t02.test.ts`
- `docs/test-reports/s02-t02.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [x] Secure host-only cookie, CSRF check, expiry/rotation and logout revocation pass expected 401/403 cases — [local evidence](../../docs/test-reports/s02-t02.md); independent review pending.
- [ ] ACC-01: Email registration, verification, login/logout and single-use password recovery tokens. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] ACC-02: Secure opaque cookies, expiry, rotation, revocation and session inventory. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] COL-03: OWNER/EDITOR/REVIEWER/VIEWER are enforced on REST; WSS enforcement lands in G2. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [x] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim. Rate limiting is S02-T06; project role guards are S02-T04.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s02-t02.test.ts tests/regression/acc-01/s02-t02.test.ts tests/regression/acc-02/s02-t02.test.ts tests/regression/col-03/s02-t02.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Run relevant integration/browser/security checks from QG-05/QG-07/QG-08/QG-09; include real PG/Redis/storage or trusted compiler when this boundary needs it. Record command, environment, actual output and actual hours in the report; listed commands are not execution evidence.

## Edge Cases & Pitfalls

Forged CSRF, consumed reset token, disabled user or foreign project denied. 400 invalid; 401 expired; 403 denied; 429 abuse; indistinguishable forgot response. Exercise denied roles/foreign IDs and retry/failure boundaries when applicable. For documentation/research, distinguish measured facts, proposals and missing external evidence.

## Risks / Scope Cuts

Re-estimate if actual effort exceeds the likely estimate by 50% or the same blocker lasts two work sessions. Keep durable data, ACLs, privacy and authentic output. Defer optional UI breadth/provider/advanced support in the ordered roadmap cuts. If a required boundary cannot be validated, keep this task blocked and do not silently shrink its acceptance.

## Definition of Done

- [x] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [x] Dependencies/contracts and applicable shared quality gates pass.
- [x] Runtime behavior is real, permission-checked and persistent when applicable.
- [x] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [x] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [ ] Independent co-maintainer review complete; status updated to done only after evidence.
