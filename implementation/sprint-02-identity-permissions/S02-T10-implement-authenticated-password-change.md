---
id: S02-T10
sprint: 2
owner: "Julio"
effort_h: 6
effort_range_h: [4, 6, 8]
estimate_basis: assumption-a-03
depends_on: [S02-T07]
requirements: [ACC-06, ACC-02]
source_task: S02-T03
status: done
readiness: completed
---
# S02-T10 — Implement authenticated password change

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S02 / G1 | Julio (proposed A-02) | 6 (ASSUMPTION A-03) | [S02-T07](S02-T07-implement-profile-preferences-and-session-management.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Implement authenticated password change to satisfy the requirement statements below. Original source task: S02-T03; this additional slice closes a missing requirement or splits the broader source scope. Work only this task and its defined interface.

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
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: Verify current password and CSRF, replace Argon2id hash, invalidate other sessions and reject incorrect password without changes.
- **Errors:** 400 invalid; 401 expired; 403 denied; 429 abuse; indistinguishable forgot response.
- **Valid example:** Positive-input fixture produces this task's scoped result: Verify current password and CSRF, replace Argon2id hash, invalidate other sessions and reject incorrect password without changes.
- **Invalid example:** Forged CSRF, consumed reset token, disabled user or foreign project denied.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 6 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s02-t10.test.ts for the exact acceptance criteria below; include Forged CSRF, consumed reset token, disabled user or foreign project denied. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in apps/api/src/modules/account/password-change.ts using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in apps/api/src/modules/account/password-change.ts and connect the real behavior. |
| 1.4 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `apps/api/src/modules/account/password-change.ts`
- `tests/integration/s02-t10.test.ts`
- `tests/regression/acc-06/s02-t10.test.ts`
- `tests/regression/acc-02/s02-t10.test.ts`
- `docs/test-reports/s02-t10.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [x] Verify current password and CSRF, replace Argon2id hash, invalidate other sessions and reject incorrect password without changes.
- [x] ACC-06: Authenticated password change revokes other sessions and unused reset tokens; optional TOTP MFA remains G4. ACC-06 remains IN_PROGRESS for its remaining gate checks.
- [x] ACC-02: Scoped session preservation/revocation and expired-cookie denial are tested; ACC-02 remains IN_PROGRESS for later mapped checks.
- [x] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s02-t10.test.ts tests/regression/acc-06/s02-t10.test.ts tests/regression/acc-02/s02-t10.test.ts
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

- [x] Task acceptance and its scoped requirement assertions have real PASS evidence in the [report](../../docs/test-reports/s02-t10.md).
- [x] Dependencies/contracts and applicable shared quality gates pass.
- [x] Runtime behavior is real, permission-checked and persistent when applicable.
- [x] Report, progress, feature evidence and HTTP contract are updated; actual hours were not measured. No ADR was needed.
- [x] No secret/private source in artifacts or logs; no new external access was required.
- [x] Independent co-maintainer review complete; accepted by the Project Co-owner on 2026-10-12 in this conversation.
