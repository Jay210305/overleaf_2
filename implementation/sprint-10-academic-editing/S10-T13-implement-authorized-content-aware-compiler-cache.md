---
id: S10-T13
sprint: 10
owner: "Julio"
effort_h: 8
effort_range_h: [6, 8, 10]
estimate_basis: assumption-a-03
depends_on: [S10-T12]
requirements: [CMP-11, NFR-06]
source_task: S06-T06
status: todo
readiness: pending-dependencies
---
# S10-T13 — Implement authorized content-aware compiler cache

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S10 / G3 | Julio (proposed A-02) | 8 (ASSUMPTION A-03) | [S10-T12](S10-T12-add-debounced-automatic-compilation.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Implement authorized content-aware compiler cache to satisfy the requirement statements below. Original source task: S06-T06; this additional slice closes a missing requirement or splits the broader source scope. Work only this task and its defined interface.

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Preconditions

- Dependencies in the table are completed with evidence.
- Contract schema and a positive/negative fixture are available; required environment/tooling is validated.
- If likely effort exceeds 8 h, split the remaining unstarted work with new never-reused IDs and update the roadmap/index before Ready. The pessimistic range is uncertainty, not an authorized >8 h task.
- No private production data/credentials are needed for local fixture work.

## Interface Contract

- [compilation](../../docs/contracts/compilation.md)
- [editing-and-review](../../docs/contracts/editing-and-review.md)
- [http-api](../../docs/contracts/http-api.md)

- **Input:** Authorized source/bibliography/project settings and frozen PDF/SyncTeX artifacts.
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: Manifest/engine/image/options/policy changes invalidate key; cache hit cannot authorize another project's artifacts.
- **Errors:** Bad regex/page/file/engine rejected; unsupported profile unavailable; stale replace conflict.
- **Valid example:** Positive-input fixture produces this task's scoped result: Manifest/engine/image/options/policy changes invalidate key; cache hit cannot authorize another project's artifacts.
- **Invalid example:** Opening .bib never normalizes source; cache cannot authorize foreign artifacts.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 8 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s10-t13.test.ts for the exact acceptance criteria below; include Opening .bib never normalizes source; cache cannot authorize foreign artifacts. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in apps/jobs/src/compilation/cache.ts using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in apps/jobs/src/compilation/cache.ts and connect the real behavior. |
| 1.4 | 2 | Start with failing denial/conflict/retry assertions; implement the failure handling needed to satisfy: Bad regex/page/file/engine rejected; unsupported profile unavailable; stale replace conflict. |
| 1.5 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `apps/jobs/src/compilation/cache.ts`
- `tests/integration/s10-t13.test.ts`
- `tests/regression/cmp-11/s10-t13.test.ts`
- `tests/regression/nfr-06/s10-t13.test.ts`
- `docs/test-reports/s10-t13.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [ ] Manifest/engine/image/options/policy changes invalidate key; cache hit cannot authorize another project's artifacts
- [ ] CMP-11: Cache hashes input, engine, image/options/policy and preserves project authorization. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] NFR-06: Generated PDF sourceRevision and manifest hash match exactly. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s10-t13.test.ts tests/regression/cmp-11/s10-t13.test.ts tests/regression/nfr-06/s10-t13.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Run relevant integration/browser/security checks from QG-05/QG-07/QG-08/QG-09; include real PG/Redis/storage or trusted compiler when this boundary needs it. Record command, environment, actual output and actual hours in the report; listed commands are not execution evidence.

## Edge Cases & Pitfalls

Opening .bib never normalizes source; cache cannot authorize foreign artifacts. Bad regex/page/file/engine rejected; unsupported profile unavailable; stale replace conflict. Exercise denied roles/foreign IDs and retry/failure boundaries when applicable. For documentation/research, distinguish measured facts, proposals and missing external evidence.

## Risks / Scope Cuts

Re-estimate if actual effort exceeds the likely estimate by 50% or the same blocker lasts two work sessions. Keep durable data, ACLs, privacy and authentic output. Defer optional UI breadth/provider/advanced support in the ordered roadmap cuts. If a required boundary cannot be validated, keep this task blocked and do not silently shrink its acceptance.

## Definition of Done

- [ ] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [ ] Dependencies/contracts and applicable shared quality gates pass.
- [ ] Runtime behavior is real, permission-checked and persistent when applicable.
- [ ] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [ ] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [ ] Independent co-maintainer review complete; status updated to done only after evidence.
