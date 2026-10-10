---
id: S01-T08
sprint: 1
owner: "Project Co-owner"
effort_h: 8
effort_range_h: [6, 8, 10]
estimate_basis: assumption-a-03
depends_on: [S01-T07]
requirements: [PRO-05, PRO-06, PL-07]
source_task: S01-T08
status: done
readiness: completed
---
# S01-T08 — Create private S3 adapter

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S01 / G1 | Project Co-owner (proposed A-02) | 8 (ASSUMPTION A-03) | [S01-T07](S01-T07-test-constraints-rollback-and-naming-races.md) | [Technical spec](../../docs/planning/03-technical-spec.md), [Quality gates](../../docs/planning/06-ci-cd-and-environments.md) |

## Purpose

Create private S3 adapter to satisfy the requirement statements below. Original source task: S01-T08; the source ID is preserved; continuation tasks, where present, carry additional independently reviewable slices. Work only this task and its defined interface.

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
- **Output:** The typed boundary result in the contract, scoped to this task's deliverables: put/get/head/delete/presign obey scoped keys; unauthorized cross-project URL is denied and expected SHA-256 matches.
- **Errors:** FK/unique/version/schema failure rolls back; private presign denied.
- **Valid example:** Positive-input fixture produces this task's scoped result: put/get/head/delete/presign obey scoped keys; unauthorized cross-project URL is denied and expected SHA-256 matches.
- **Invalid example:** Foreign parent, duplicate null-parent root name, invalid DTO or public secret.

The contract links are the allowed supporting interface references. This task includes its acceptance and context; reading the original mega document is not a prerequisite. Configuration/paths above are planned targets, not existing runtime capabilities.

## Essential Sub-tasks

Each code slice starts with the specified failing assertion; documentation/research uses a failing review criterion. Each step is <=2 h and the hours sum to 8 h.

| Step | Hours | Test / review first and work |
|---|---|---|
| 1.1 | 1 | Write and run failing contract/behavior assertions in tests/integration/s01-t08.test.ts for the exact acceptance criteria below; include Foreign parent, duplicate null-parent root name, invalid DTO or public secret. |
| 1.2 | 2 | Start with a failing positive-input assertion; implement the producer/core slice in packages/storage/src/s3.ts using the named contract input/output. |
| 1.3 | 2 | Start with a failing consumer/schema assertion; define shared ObjectRef, StorageAdapter and RevisionManifest in packages/contracts/src/storage.ts, then connect the S3 adapter and its consumers. |
| 1.4 | 2 | Start with failing denial/conflict/retry assertions; implement the failure handling needed to satisfy: FK/unique/version/schema failure rolls back; private presign denied. |
| 1.5 | 1 | Run the task assertions and applicable shared quality gates; refactor under green checks and record actual effort, failures, feature status and documentation. |

## Deliverables

- `packages/contracts/src/storage.ts` — shared ObjectRef, StorageAdapter and RevisionManifest types from the referenced contract.
- `packages/storage/src/s3.ts`
- `tests/integration/s01-t08.test.ts`
- `tests/regression/pro-05/s01-t08.test.ts`
- `tests/regression/pro-06/s01-t08.test.ts`
- `tests/regression/pl-07/s01-t08.test.ts`
- `docs/test-reports/s01-t08.md`

Update existing feature evidence and sprint progress entries for the IDs listed below. These are future implementation paths; no application code/test is created by this planning task file.

## Acceptance Criteria

- [x] put/get/head/delete/presign obey scoped keys; unauthorized cross-project URL is denied and expected SHA-256 matches
- [x] PRO-05: Validate permitted TeX/bibliography/style/image/PDF/font uploads with progress and failures. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [x] PRO-06: Download authorized source ZIP, genuine PDF, logs and permitted artifacts. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [x] PL-07: Private credentials, no unauthorized code reuse and explicit compiler trust boundary. Implement the part owned by this task; the feature is DONE only after all mapped task assertions for its gate pass.
- [x] Valid input passes, invalid input produces the specified failure and leaves state safe; no dummy output or UI-only completion claim.

## Verification

The following commands are target runtime checks available after S00 setup. Expected result: task assertions PASS, denied/conflict fixtures preserve state, and applicable quality gates pass. A missing script or service is a blocker, not PASS.

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s01-t08.test.ts tests/regression/pro-05/s01-t08.test.ts tests/regression/pro-06/s01-t08.test.ts tests/regression/pl-07/s01-t08.test.ts
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

- [x] Task acceptance and its scoped requirement assertions have real PASS evidence.
- [x] Dependencies/contracts and applicable shared quality gates pass.
- [x] Runtime behavior is real, permission-checked and persistent when applicable.
- [x] Report, progress, feature evidence, ADR/contract changes and actual effort are updated.
- [x] No secret/private source in artifacts or logs; unresolved access/research is visibly blocked.
- [x] Independent co-maintainer review complete; status updated to done only after evidence.
