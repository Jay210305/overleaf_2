---
id: S10-T11
sprint: 10
owner: "Julio"
effort_h: 6
effort_range_h: [4, 6, 8]
estimate_basis: assumption-a-03
depends_on: [S10-T09]
requirements: [EDT-11, EDT-14]
source_task: S10-T06
status: done
readiness: completed
---
# S10-T11 — Add local spell checking and static error help

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S10 / G3 | Julio (proposed A-02) | 6 (ASSUMPTION A-03) | [S10-T09](S10-T09-persist-editor-preferences-symbols-and-layout.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Add local spell checking and static error help to satisfy the requirement statements below. Original source task: S10-T06; this additional slice closes a missing requirement or splits the broader source scope. Work only this task and its defined interface.

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
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: Local dictionary ignores commands and markup; static help works offline and sends no text to external service.
- **Errors:** Bad regex/page/file/engine rejected; unsupported profile unavailable; stale replace conflict.
- **Valid example:** Positive-input fixture produces this task's scoped result: Local dictionary ignores commands and markup; static help works offline and sends no text to external service.
- **Invalid example:** Opening .bib never normalizes source; cache cannot authorize foreign artifacts.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 6 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s10-t11.test.ts for the exact acceptance criteria below; include Opening .bib never normalizes source; cache cannot authorize foreign artifacts. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in packages/editor/src/spellcheck.ts using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in apps/web/src/features/help/latex-help.tsx and connect the real behavior. |
| 1.4 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `packages/editor/src/spellcheck.ts`
- `apps/web/src/features/help/latex-help.tsx`
- `tests/integration/s10-t11.test.ts`
- `tests/regression/edt-11/s10-t11.test.ts`
- `tests/regression/edt-14/s10-t11.test.ts`
- `docs/test-reports/s10-t11.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [ ] Local dictionary ignores commands and markup; static help works offline and sends no text to external service
- [ ] EDT-11: Local spell checking leaves LaTeX commands unchanged. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] EDT-14: Static command/error help first; AI requires explicit consent and does not block editing. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [ ] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s10-t11.test.ts tests/regression/edt-11/s10-t11.test.ts tests/regression/edt-14/s10-t11.test.ts
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
