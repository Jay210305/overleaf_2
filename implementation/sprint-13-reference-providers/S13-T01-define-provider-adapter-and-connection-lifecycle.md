---
id: S13-T01
sprint: 13
owner: "Project Co-owner"
effort_h: 8
effort_range_h: [6, 8, 10]
estimate_basis: assumption-a-03
depends_on: [S12-T07]
requirements: [INT-03, INT-04, INT-07]
source_task: S13-T01
status: todo
readiness: pending-dependencies
---
# S13-T01 — Define provider adapter and connection lifecycle

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S13 / G4 | Project Co-owner (proposed A-02) | 8 (ASSUMPTION A-03) | [S12-T07](../sprint-12-github-sync/S12-T07-verify-github-failure-concurrency-cases.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Define provider adapter and connection lifecycle to satisfy the requirement statements below. Original source task: S13-T01; the source ID is preserved; continuation tasks, where present, carry additional independently reviewable slices. Work only this task and its defined interface.

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Preconditions

- Dependencies in the table are completed with evidence.
- Contract schema and a positive/negative fixture are available; required environment/tooling is validated.
- If likely effort exceeds 8 h, split the remaining unstarted work with new never-reused IDs and update the roadmap/index before Ready. The pessimistic range is uncertainty, not an authorized >8 h task.
- Research must validate provider/protocol capabilities and licenses; credentialed work requires authorized test accounts. Missing access is BLOCKED_BY_CREDENTIALS or BLOCKED_BY_PROVIDER.

## Interface Contract

- [integrations](../../docs/contracts/integrations.md)
- [http-api](../../docs/contracts/http-api.md)

- **Input:** Capability-verified provider and authorized encrypted credentials, selected library/entries.
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: Typed capability/error model handles connect/disconnect/refresh/revoke and keeps user connection separate from project permission.
- **Errors:** CREDENTIALS_MISSING/CAPABILITY_UNSUPPORTED/TOKEN_EXPIRED/REMOTE_CONFLICT.
- **Valid example:** Positive-input fixture produces this task's scoped result: Typed capability/error model handles connect/disconnect/refresh/revoke and keeps user connection separate from project permission.
- **Invalid example:** No legitimate API access means BLOCKED_BY_PROVIDER and no parity claim.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 8 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s13-t01.test.ts for the exact acceptance criteria below; include No legitimate API access means BLOCKED_BY_PROVIDER and no parity claim. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in packages/contracts/src/provider.ts using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in apps/api/src/modules/integrations/connections.ts and connect the real behavior. |
| 1.4 | 2 | Start with failing denial/conflict/retry assertions; implement the failure handling needed to satisfy: CREDENTIALS_MISSING/CAPABILITY_UNSUPPORTED/TOKEN_EXPIRED/REMOTE_CONFLICT. |
| 1.5 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `packages/contracts/src/provider.ts`
- `apps/api/src/modules/integrations/connections.ts`
- `tests/integration/s13-t01.test.ts`
- `tests/regression/int-03/s13-t01.test.ts`
- `tests/regression/int-04/s13-t01.test.ts`
- `tests/regression/int-07/s13-t01.test.ts`
- `docs/test-reports/s13-t01.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [ ] Typed capability/error model handles connect/disconnect/refresh/revoke and keeps user connection separate from project permission
- [ ] INT-03: Authorized Zotero adapter imports/refreshes libraries and protects tokens. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] INT-04: Mendeley/Papers exist only where API access and terms permit the required operation. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] INT-07: Authorized Dropbox export/sync handles revocation and explicit conflicts. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s13-t01.test.ts tests/regression/int-03/s13-t01.test.ts tests/regression/int-04/s13-t01.test.ts tests/regression/int-07/s13-t01.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Run relevant integration/browser/security checks from QG-05/QG-07/QG-08/QG-09; include real PG/Redis/storage or trusted compiler when this boundary needs it. Record command, environment, actual output and actual hours in the report; listed commands are not execution evidence.

## Edge Cases & Pitfalls

No legitimate API access means BLOCKED_BY_PROVIDER and no parity claim. CREDENTIALS_MISSING/CAPABILITY_UNSUPPORTED/TOKEN_EXPIRED/REMOTE_CONFLICT. Exercise denied roles/foreign IDs and retry/failure boundaries when applicable. For documentation/research, distinguish measured facts, proposals and missing external evidence.

## Risks / Scope Cuts

Re-estimate if actual effort exceeds the likely estimate by 50% or the same blocker lasts two work sessions. Keep durable data, ACLs, privacy and authentic output. Defer optional UI breadth/provider/advanced support in the ordered roadmap cuts. If a required boundary cannot be validated, keep this task blocked and do not silently shrink its acceptance.

## Definition of Done

- [ ] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [ ] Dependencies/contracts and applicable shared quality gates pass.
- [ ] Runtime behavior is real, permission-checked and persistent when applicable.
- [ ] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [ ] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [ ] Independent co-maintainer review complete; status updated to done only after evidence.
