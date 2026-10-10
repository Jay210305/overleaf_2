---
id: S07-T07
sprint: 7
owner: "Project Co-owner"
effort_h: 8
effort_range_h: [6, 8, 10]
estimate_basis: assumption-a-03
depends_on: [S07-T06]
requirements: [COL-01, NFR-02]
source_task: S07-T07
status: todo
readiness: pending-dependencies
---
# S07-T07 — Coordinate two collaboration replicas

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S07 / G2 | Project Co-owner (proposed A-02) | 8 (ASSUMPTION A-03) | [S07-T06](S07-T06-synchronize-tree-changes-with-open-rooms.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Coordinate two collaboration replicas to satisfy the requirement statements below. Original source task: S07-T07; the source ID is preserved; continuation tasks, where present, carry additional independently reviewable slices. Work only this task and its defined interface.

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Preconditions

- Dependencies in the table are completed with evidence.
- Contract schema and a positive/negative fixture are available; required environment/tooling is validated.
- If likely effort exceeds 8 h, split the remaining unstarted work with new never-reused IDs and update the roadmap/index before Ready. The pessimistic range is uncertainty, not an authorized >8 h task.
- No private production data/credentials are needed for local fixture work.

## Interface Contract

- [collaboration](../../docs/contracts/collaboration.md)
- [http-api](../../docs/contracts/http-api.md)

- **Input:** Single-use scoped 30s WSS ticket, current Origin/session/ACL, Yjs update and bounded awareness.
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: Two servers with Redis/PG converge with clients crossing replicas; no sticky-session or local-volume assumption.
- **Errors:** Ticket replay/expiry denied; viewer/revocation denied; DB outage stays pending.
- **Valid example:** Positive-input fixture produces this task's scoped result: Two servers with Redis/PG converge with clients crossing replicas; no sticky-session or local-volume assumption.
- **Invalid example:** Broadcast receipt without PG commit cannot produce saved acknowledgement.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 8 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s07-t07.test.ts for the exact acceptance criteria below; include Broadcast receipt without PG commit cannot produce saved acknowledgement. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in apps/collab/src/redis.ts using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in tests/integration/collab-replicas.test.ts and connect the real behavior. |
| 1.4 | 2 | Start with failing denial/conflict/retry assertions; implement the failure handling needed to satisfy: Ticket replay/expiry denied; viewer/revocation denied; DB outage stays pending. |
| 1.5 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `apps/collab/src/redis.ts`
- `tests/integration/collab-replicas.test.ts`
- `tests/integration/s07-t07.test.ts`
- `tests/regression/col-01/s07-t07.test.ts`
- `tests/regression/nfr-02/s07-t07.test.ts`
- `docs/test-reports/s07-t07.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [ ] Two servers with Redis/PG converge with clients crossing replicas; no sticky-session or local-volume assumption
- [ ] COL-01: Yjs concurrent editing converges and reconnects without lost confirmed text. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] NFR-02: Five simultaneous editors converge on identical content. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s07-t07.test.ts tests/regression/col-01/s07-t07.test.ts tests/regression/nfr-02/s07-t07.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Run relevant integration/browser/security checks from QG-05/QG-07/QG-08/QG-09; include real PG/Redis/storage or trusted compiler when this boundary needs it. Record command, environment, actual output and actual hours in the report; listed commands are not execution evidence.

## Edge Cases & Pitfalls

Broadcast receipt without PG commit cannot produce saved acknowledgement. Ticket replay/expiry denied; viewer/revocation denied; DB outage stays pending. Exercise denied roles/foreign IDs and retry/failure boundaries when applicable. For documentation/research, distinguish measured facts, proposals and missing external evidence.

## Risks / Scope Cuts

Re-estimate if actual effort exceeds the likely estimate by 50% or the same blocker lasts two work sessions. Keep durable data, ACLs, privacy and authentic output. Defer optional UI breadth/provider/advanced support in the ordered roadmap cuts. If a required boundary cannot be validated, keep this task blocked and do not silently shrink its acceptance.

## Definition of Done

- [ ] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [ ] Dependencies/contracts and applicable shared quality gates pass.
- [ ] Runtime behavior is real, permission-checked and persistent when applicable.
- [ ] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [ ] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [ ] Independent co-maintainer review complete; status updated to done only after evidence.
