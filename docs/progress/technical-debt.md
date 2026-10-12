# Technical Debt Backlog

Observed S00 follow-ups; no later feature is silently declared complete.

| ID | Status | Owner | Location | Effort (h) | Verification | Closure / next cycle |
|---|---|---|---|---|---|---|
| DT-01 | OPEN | Both (proposed) | infra/minio/README.md | Not estimated | Review supported S3-compatible development/hosted storage before a hosted release | Archived MinIO source is a local fixture, not a production dependency approval |
| DT-02 | OPEN | Julio (proposed) | apps/web/vite.config.ts | Not estimated | Measure UI bundle as product features arrive | Lazy health panel added; main bundle remains near 500 kB |
| DT-03 | OPEN | Julio (proposed) | apps/api/src/modules/account/avatar.ts | Not estimated | Inject a database-update failure and an object-delete failure; verify an unreferenced upload is eventually found and removed | S02-T11 retries queued replacement cleanup, but a new object may be orphaned if both the metadata transaction and best-effort rollback delete fail; add a cross-store reconciliation pass before hosted release |

Effort is not fabricated. Assign bounded tasks when these become execution scope.
