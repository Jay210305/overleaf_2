---
id: S05-T12
sprint: 5
owner: "Project Co-owner"
effort_h: 8
effort_range_h: [6, 8, 10]
estimate_basis: assumption-a-03
depends_on: [S05-T03]
requirements: [PRO-02, PRO-10]
source_task: S05-T03
status: done
readiness: completed
---
# S05-T12 — Implement authenticated ZIP import intake

| Sprint | Owner | Effort (h, sum to total) | Dependencies | Related docs |
|---|---|---|---|---|
| S05 / G1 | Project Co-owner (proposed A-02) | 8 (ASSUMPTION A-03) | [S05-T03](S05-T03-validate-archives-and-define-idempotent-import-job.md) | [Archive import design](../../docs/superpowers/specs/2026-10-12-s05-archive-import-design.md), [HTTP API](../../docs/contracts/http-api.md), [Storage](../../docs/contracts/storage-and-revisions.md) |

## Purpose

Accept a ZIP intended to create a new project through a session-bound, signed private PUT and enqueue one S05-T03 validation job. This is distinct from S05-T01 project-file upload, which rejects ZIP and creates an existing-project node. S05-T10 applies validated jobs later; this task does not create a project.

## Preconditions

- S05-T03 has accepted evidence for its import-job schema, typed reserve/claim repository and private validator. Its own S05-T02 prerequisite is accepted.
- Exact Origin, current verified/enabled session and CSRF guards are available. The private storage adapter and local MinIO have been verified; hosted CORS remains deployment evidence.
- If the likely effort exceeds 8 h, split remaining unstarted work under a new ID before marking Ready. No production credentials or private manuscripts are required for local fixtures.

## Interface Contract

Follow the [approved design](../../docs/superpowers/specs/2026-10-12-s05-archive-import-design.md), [HTTP API](../../docs/contracts/http-api.md) and [Storage](../../docs/contracts/storage-and-revisions.md). Before route implementation, synchronize the import-specific DTO and OpenAPI response: `validated` means ready for S05-T10, never project success.

- **Input:** Authenticated `POST /api/v1/projects/imports/presign` with ZIP size and SHA-256; signed PUT bytes; `POST /api/v1/projects/imports` with `{uploadId, title}` and `Idempotency-Key`. All mutations require exact Origin, current session and CSRF.
- **Output:** 300-second PUT URL scoped to `imports/<actorId>/uploads/<uploadId>`; after backend byte/hash verification, `202` with the same durable import job for same actor/key/input. `GET /api/v1/projects/imports/{jobId}` returns actor-scoped safe status, without object keys.
- **Errors:** 400 malformed input, 401 missing/expired session, 403 invalid Origin/CSRF or disabled account, 404 foreign upload/job, 409 reused key with changed input, 413 ZIP over 25 MiB, 422 missing/mismatched private object, 503 unavailable storage. Worker ZIP-validation errors are reported by safe status after the asynchronous job runs.
- **Valid example:** A verified 1 MiB ZIP from the current actor queues one job and a repeated completion with the same key, bytes and title returns that job.
- **Invalid example:** A foreign upload ID or a byte/hash mismatch creates no job and returns 404 or 422; a VIEWER project role is irrelevant because this creates a new project for the authenticated actor.

## Essential Sub-tasks

| Step | Hours | Test / review first and work |
|---|---:|---|
| 1.1 | 1 | Write failing route assertions for exact Origin/session/CSRF, signed PUT scope, foreign upload and same-key retry in `tests/integration/s05-t12.test.ts`. |
| 1.2 | 2 | Implement strict import-upload intent and 300-second presign in `apps/api/src/modules/imports/routes.ts` with actor-scoped storage keys. |
| 1.3 | 2 | Start with a failing real-object completion test; verify actual bytes/hash, reserve the S05-T03 job before server-only copy, and move it to queued only after copy verification. |
| 1.4 | 2 | Start with failing denial/retry/cleanup assertions; add actor-scoped status, same-key conflict, staging recovery and expired intake cleanup without returning object keys. |
| 1.5 | 1 | Run focused and shared gates, record observed commands/results in `docs/test-reports/s05-t12.md`, and update task, roadmap, progress, traceability and feature evidence without claiming a completed import. |

## Deliverables

- `apps/api/src/modules/imports/routes.ts`
- `packages/db/migrations/0007-import-upload-intents.sql` and corresponding typed schema
- `tests/integration/s05-t12.test.ts`
- `tests/regression/pro-02/s05-t12.test.ts`
- `tests/regression/pro-10/s05-t12.test.ts`
- `docs/test-reports/s05-t12.md`

The concrete migration number is reserved by this task package; inspect contributor migrations before implementation and reassign an unused number if one has appeared. Update the import-specific OpenAPI/DTO and storage-key tests in the same slice. Planned paths are not evidence that routes exist.

## Acceptance Criteria

- [x] Current-session signed ZIP PUT verifies actual bytes/hash and enqueues one actor-scoped import job; foreign/forged/reused input is denied
- [x] Current-session ZIP input stages through a private signed PUT, verifies actual bytes/hash, and enqueues exactly one durable job per actor/idempotency key/input.
- [x] Foreign uploads/jobs, forged Origin/CSRF, disabled sessions and changed-input key reuse are denied without exposing object keys or creating a project.
- [x] Expired signed-upload objects are cleaned after URL expiry; server-only job archives remain until S05-T03/S05-T10 terminal handling.
- [x] PRO-02/PRO-10 scoped regression tests pass. Complete new-project import remains owned by S05-T10 and later journey checks.

## Verification

```text
python scripts/plan_lint.py
pnpm exec vitest run tests/integration/s05-t12.test.ts tests/regression/pro-02/s05-t12.test.ts tests/regression/pro-10/s05-t12.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Use real local PostgreSQL and MinIO for signed PUT and persistence assertions, then run applicable security, artifact and repository-wide gates. Record actual outputs, environment and unrun checks; no planned route, mock object store or written plan is PASS evidence.

## Edge Cases & Pitfalls

An expiring signed PUT may still mutate its upload object after completion; the job consumes only the separate server-only copied key. Reserve the job row before that copy so a failed copy or database update is idempotently recoverable. A validated job is not a created project. Do not copy ZIP paths into filesystem paths or log archive bytes/keys.

## Risks / Scope Cuts

Re-estimate if actual work exceeds the likely estimate by 50% or the same blocker lasts two sessions. Preserve authorization, durability and private storage; defer optional UI breadth rather than weakening those boundaries.

## Definition of Done

- [x] Scoped acceptance has real service-backed PASS evidence and applicable gates pass.
- [x] S05-T03 dependency and import-specific contracts are accepted.
- [x] Report, frontmatter, index, roadmap, stage progress and feature evidence are synchronized.
- [x] Independent co-maintainer review is complete before changing status to `done`.
