# S05 — Assets ZIP and templates

**Status:** IN_PROGRESS | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 80 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S05-T01](../../implementation/sprint-05-assets-import-export/S05-T01-implement-verified-presigned-uploads.md) | IN_PROGRESS | Not measured | [Scoped test report](../test-reports/s05-t01.md); independent review pending |
| [S05-T09](../../implementation/sprint-05-assets-import-export/S05-T09-implement-quota-and-orphan-object-cleanup.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T02](../../implementation/sprint-05-assets-import-export/S05-T02-create-multi-file-upload-interactions.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T03](../../implementation/sprint-05-assets-import-export/S05-T03-validate-archives-and-define-idempotent-import-job.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T10](../../implementation/sprint-05-assets-import-export/S05-T10-apply-validated-import-as-a-consistent-project.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T04](../../implementation/sprint-05-assets-import-export/S05-T04-export-immutable-source-zip.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T05](../../implementation/sprint-05-assets-import-export/S05-T05-preview-and-download-safe-binary-assets.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T06](../../implementation/sprint-05-assets-import-export/S05-T06-create-minimal-versioned-internal-templates.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T11](../../implementation/sprint-05-assets-import-export/S05-T11-create-template-preview-and-instantiate-ui.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T07](../../implementation/sprint-05-assets-import-export/S05-T07-verify-imported-paths-and-custom-styles.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S05-T08](../../implementation/sprint-05-assets-import-export/S05-T08-verify-hostile-zip-and-round-trip-journeys.md) | NOT_STARTED | Not recorded | No implementation evidence |

## Decisions and Migrations

The published branch `codex/sprint-05-assets-import-export` began at `origin/main` (`40f0870`) and merged `origin/codex/sprint-04-code-editor` (`6549a09`) in `d09db72`. S05-T01 adds durable `pending_uploads` in `0005-upload-intents.sql`, scoped signed staging PUTs, bounded verification, canonical Yjs text import and private binary blob creation. The staging object remains private until S05-T09 cleanup after URL expiry. No production migration runner was found.

## Validation

Focused S05 API/regression tests passed (3 files, 14 tests) with Windows/Node 24/pnpm 11.25.0 and local PostgreSQL/MinIO. `pnpm typecheck`, `pnpm lint`, `pnpm build`, planning lint, map check and artifact check passed. Repository-wide `pnpm test` passed 361 tests but failed 2 inherited Mailpit tests; `pnpm format:check` failed on 37 inherited S03/S04 files. See the [S05-T01 report](../test-reports/s05-t01.md) for commands and limits. Independent review and shared gates remain open.

## Risks and Debt

S05-T09 owns expired staging and orphan blob cleanup; S05-T02 owns upload progress/cancel UI. Migration deployment and inherited gate failures are tracked in [Open Gaps](open-gaps.md). Independent co-maintainer review is pending; do not mark S05-T01 done.

## Next Task

Finish S05-T01 verification and independent review; then select S05-T09, whose cleanup depends on the durable upload-intent boundary.
