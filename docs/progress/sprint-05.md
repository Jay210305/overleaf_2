# S05 — Assets ZIP and templates

**Status:** IN_PROGRESS | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 88 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S05-T01](../../implementation/sprint-05-assets-import-export/S05-T01-implement-verified-presigned-uploads.md) | DONE | Not measured | [Scoped test report](../test-reports/s05-t01.md); accepted 2026-10-13 after focused 14/14 PASS re-run plus typecheck/lint PASS |
| [S05-T09](../../implementation/sprint-05-assets-import-export/S05-T09-implement-quota-and-orphan-object-cleanup.md) | DONE | Not measured | [Scoped test report](../test-reports/s05-t09.md); accepted 2026-10-13 after focused 9/9 PASS re-run |
| [S05-T02](../../implementation/sprint-05-assets-import-export/S05-T02-create-multi-file-upload-interactions.md) | DONE | Not measured | [Scoped test report](../test-reports/s05-t02.md); accepted 2026-10-13 after focused 8/8 PASS re-run |
| [S05-T03](../../implementation/sprint-05-assets-import-export/S05-T03-validate-archives-and-define-idempotent-import-job.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T12](../../implementation/sprint-05-assets-import-export/S05-T12-implement-authenticated-zip-import-intake.md) | NOT_STARTED | Not recorded | Approved design and planning only; no route evidence |
| [S05-T10](../../implementation/sprint-05-assets-import-export/S05-T10-apply-validated-import-as-a-consistent-project.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T04](../../implementation/sprint-05-assets-import-export/S05-T04-export-immutable-source-zip.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T05](../../implementation/sprint-05-assets-import-export/S05-T05-preview-and-download-safe-binary-assets.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T06](../../implementation/sprint-05-assets-import-export/S05-T06-create-minimal-versioned-internal-templates.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T11](../../implementation/sprint-05-assets-import-export/S05-T11-create-template-preview-and-instantiate-ui.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T07](../../implementation/sprint-05-assets-import-export/S05-T07-verify-imported-paths-and-custom-styles.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T08](../../implementation/sprint-05-assets-import-export/S05-T08-verify-hostile-zip-and-round-trip-journeys.md) | NOT_STARTED | Not recorded | No implementation evidence |

## Decisions and Migrations

The published branch `codex/sprint-05-assets-import-export` began at `origin/main` (`40f0870`) and merged `origin/codex/sprint-04-code-editor` (`6549a09`) in `d09db72`. S05-T01 adds durable `pending_uploads` in `0005-upload-intents.sql`, scoped signed staging PUTs, bounded verification, canonical Yjs text import and private binary blob creation. The staging object remains private until S05-T09 cleanup after URL expiry. No production migration runner was found.

S05-T09 adds a private, runnable jobs pass for aged staging and orphan blobs. It leaves all blobs in projects with revisions until GAP-17 protects historical references across node deletion.

S05-T02 adds the browser multi-file upload flow using the S05-T01 presign/complete API and exact-origin local MinIO CORS. A stable completion idempotency key is reused after an uncertain response; the tree refreshes only after durable completion.

The approved [S05 archive import design](../superpowers/specs/2026-10-12-s05-archive-import-design.md) adds S05-T12 as the authenticated ZIP intake between S05-T03 private validation/job staging and S05-T10 project application. This is planning evidence, not a live import route.

## Validation

Focused S05 API/regression tests passed (3 files, 14 tests) with Windows/Node 24/pnpm 11.25.0 and local PostgreSQL/MinIO. `pnpm typecheck`, `pnpm lint`, `pnpm build`, planning lint, map check and artifact check passed. Repository-wide `pnpm test` passed 361 tests but failed 2 inherited Mailpit tests; `pnpm format:check` failed on 37 inherited S03/S04 files. See the [S05-T01 report](../test-reports/s05-t01.md) for commands and limits. Independent review and shared gates remain open.

S05-T09 focused PostgreSQL/MinIO tests pass (3 files, 9 tests), along with lint, typecheck and build. The full `pnpm test` now passes 135 files/374 tests with Docker running. Its one-shot jobs command returned a clean zero-object pass for a nonexistent project. See [S05-T09 report](../test-reports/s05-t09.md) for the current gate status.

S05-T02 focused tests pass (3 files, 8 tests), and a real Edge journey passed with local PostgreSQL/MinIO plus axe serious/critical checks. Lint, typecheck, build, security, artifact, planning and map checks pass; repository-wide `pnpm test` passes 138 files/382 tests. Repository-wide `pnpm format:check` remains blocked by 37 inherited S03/S04 files (GAP-16). See the [S05-T02 report](../test-reports/s05-t02.md) for commands and limits.

## Risks and Debt

S05-T09 cleanup is conservative around revisions because the current schema can erase historical item references. S05-T02's hosted-storage CORS and cross-browser coverage remain unverified. Two LOW review nits recorded 2026-10-13 without touching accepted code: the browser `.bst` MIME allowlist is narrower than the server policy (server stays authoritative), and a row hung in `completing` has no cancel affordance (network failure still yields error plus retry). Migration deployment, historical references and inherited gate failures are tracked in [Open Gaps](open-gaps.md). S05-T01, S05-T09 and S05-T02 were accepted 2026-10-13; do not mark later tasks done without their own review.

## Next Task

S05-T03 is Ready (S05-T02 accepted 2026-10-13; GAP-18/GAP-19 closed). Implement the approved S05-T03 validation/job slice before S05-T12 intake and S05-T10 application. GAP-20 tracks the still-unavailable route; GAP-17 still guards GC reclamation.
