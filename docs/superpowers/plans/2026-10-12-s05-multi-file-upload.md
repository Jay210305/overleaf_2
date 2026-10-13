# S05-T02 Multi-file Upload Plan

**Spec:** [Multi-file upload design](../specs/2026-10-12-s05-multi-file-upload-design.md). **Task:** `implementation/sprint-05-assets-import-export/S05-T02-create-multi-file-upload-interactions.md`.

1. Write failing component assertions for selection/drop, progress, cancel, retry and individual errors. Confirm the existing workspace has no upload control.
2. Implement the browser transport and `FileUploader` with one active transfer at a time, stable completion idempotency and server-authoritative success. Connect its completion callback to `FileTree` refresh.
3. Write a failing local MinIO browser-origin preflight test. Configure exact-origin bucket CORS through the existing storage init path and rerun it.
4. Add real API/MinIO regression assertions for allowed and denied uploads, run accessibility checks where available, then run focused and shared quality gates.
5. Record evidence and dependency blockers. Keep task `in_progress` until S05-T09/S05-T01 and independent review are accepted, then commit and push this slice on the S05 branch.
