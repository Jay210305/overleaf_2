---
id: S05-T11
sprint: 5
owner: "Project Co-owner"
effort_h: 6
effort_range_h: [4, 6, 8]
estimate_basis: assumption-a-03
depends_on: [S05-T06]
requirements: [PRO-11, PRO-02]
source_task: S05-T06
status: done
readiness: completed
---
# S05-T11 — Create template preview and instantiate UI

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S05 / G1 | Project Co-owner (proposed A-02) | 6 (ASSUMPTION A-03) | [S05-T06](S05-T06-create-minimal-versioned-internal-templates.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Create template preview and instantiate UI to satisfy the requirement statements below. Original source task: S05-T06; this additional slice closes a missing requirement or splits the broader source scope. Work only this task and its defined interface.

Strict TypeScript; server-side authorization for every REST/WSS/object action; genuine TeX output; canonical Yjs text; immutable revision inputs; commit-before-saved; no secrets/private source in logs; no anonymous/untrusted compilation before verified G5 isolation; preserve contributor changes.

## Preconditions

- Dependencies in the table are completed with evidence.
- Contract schema and a positive/negative fixture are available; required environment/tooling is validated.
- If likely effort exceeds 8 h, split the remaining unstarted work with new never-reused IDs and update the roadmap/index before Ready. The pessimistic range is uncertainty, not an authorized >8 h task.
- No private production data/credentials are needed for local fixture work.

## Interface Contract

- [storage-and-revisions](../../docs/contracts/storage-and-revisions.md)
- [http-api](../../docs/contracts/http-api.md)

- **Input:** Authorized upload metadata/bytes or validated archive and target immutable revision.
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: Catalogue filter/detail and instantiate use real versioned manifest; preview assets authorized and new project is independent.
- **Errors:** 400 unsafe path; 413 bytes/nodes; 422 MIME/hash/symlink/bomb; no partial project.
- **Valid example:** Positive-input fixture produces this task's scoped result: Catalogue filter/detail and instantiate use real versioned manifest; preview assets authorized and new project is independent.
- **Invalid example:** Traversal, foreign presign or oversized decompression denied before apply.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 6 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s05-t11.test.ts for the exact acceptance criteria below; include Traversal, foreign presign or oversized decompression denied before apply. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in apps/web/src/features/templates/template-preview.tsx using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/persistence assertion; complete the consumer or integration slice in apps/web/src/features/templates/template-preview.tsx and connect the real behavior. |
| 1.4 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `apps/web/src/features/templates/template-preview.tsx`
- `tests/integration/s05-t11.test.ts`
- `tests/regression/pro-11/s05-t11.test.ts`
- `tests/regression/pro-02/s05-t11.test.ts`
- `docs/test-reports/s05-t11.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [x] Catalogue filter/detail and instantiate use real versioned manifest; preview assets authorized and new project is independent
- [x] PRO-11: Versioned internal-template catalogue supports filters, preview and instantiation; minimal template is in G1. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [x] PRO-02: Create blank, minimal example, internal-template and ZIP projects. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [x] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s05-t11.test.ts tests/regression/pro-11/s05-t11.test.ts tests/regression/pro-02/s05-t11.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Run relevant integration/browser/security checks from QG-05/QG-07/QG-08/QG-09; include real PG/Redis/storage or trusted compiler when this boundary needs it. Record command, environment, actual output and actual hours in the report; listed commands are not execution evidence.

## Edge Cases & Pitfalls

Traversal, foreign presign or oversized decompression denied before apply. 400 unsafe path; 413 bytes/nodes; 422 MIME/hash/symlink/bomb; no partial project. Exercise denied roles/foreign IDs and retry/failure boundaries when applicable. For documentation/research, distinguish measured facts, proposals and missing external evidence.

## Risks / Scope Cuts

Re-estimate if actual effort exceeds the likely estimate by 50% or the same blocker lasts two work sessions. Keep durable data, ACLs, privacy and authentic output. Defer optional UI breadth/provider/advanced support in the ordered roadmap cuts. If a required boundary cannot be validated, keep this task blocked and do not silently shrink its acceptance.

## Definition of Done

- [x] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [x] Dependencies/contracts and applicable shared quality gates pass.
- [x] Runtime behavior is real, permission-checked and persistent when applicable.
- [x] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [x] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [x] Independent co-maintainer review complete; status updated to done only after evidence.
