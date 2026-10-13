# S05 Validated Import Project Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply one S05-T03 validated ZIP job as one durable, ID-based project with canonical Yjs text and verified binary assets.

**Architecture:** A private jobs pass re-reads the server-owned archive and reproduces its validated manifest before writing. It reserves a stable project ID on the job, prepares content-addressed binary objects under that ID, then inserts the project, tree, text updates and `succeeded` job transition in one PostgreSQL transaction. A retry reuses the reserved ID and returns the same project; PostgreSQL never exposes a partial project.

**Tech Stack:** TypeScript, PostgreSQL, Yjs, `yauzl` 3.4.0, private S3-compatible storage, Vitest with local PostgreSQL and MinIO.

**Spec:** `docs/superpowers/specs/2026-10-12-s05-archive-import-design.md`

## Global Constraints

- Start product code only after S05-T12 has independent co-maintainer acceptance; S05-T03 is already accepted.
- Read at most 25 MiB compressed; cap expanded content at 100 MiB, each file at 25 MiB, entries at 2,000 nodes, and per-entry expansion at 100:1.
- Never trust a client key, ZIP path, persisted manifest or object ETag as proof of bytes; do not extract to the filesystem or log source/keys.
- Only a fully committed project may be visible; imported text begins as a canonical Yjs update and binaries use private `projects/<projectId>/blobs/<sha256>` keys.
- Keep a 14-day server-only import archive retention after success; never delete a current project blob as import cleanup.

## Review Focus

- Archive bytes replaced after validation: re-read SHA-256 and every entry hash; fail safely with no project.
- Validated manifest changed or reordered: compare the complete versioned manifest with a fresh scan before applying.
- Missing explicit folders and folder/file path collisions: create each ancestor once or reject the collision before any project row commits.
- Storage write or transaction failure midway: retry with the same reserved ID and leave no partial visible tree.
- Concurrent apply passes for one job: only one transaction may transition it to `succeeded`; both callers observe one project ID.

---

### Task 1: Reopen validated archive with bytes

**Files:** Modify `apps/jobs/src/imports/zip.ts`; test in `tests/integration/s05-t10.test.ts`.

**Interfaces:** Consume `ImportManifest` from `@latex-collab/db/repositories/import-jobs`. Produce `readArchiveForApply(bytes: Uint8Array, expected: ImportManifest): Promise<Map<string, Buffer>>`; the map contains file paths only. Reuse the validator's bounded scan so it reproduces the same sorted manifest and checks each entry's actual bytes, hash and CRC.

- [ ] **Step 1: Write failing tests** for a nested TeX/PNG ZIP returning the exact bytes, changed archive bytes, tampered manifest hash/version, and folder/file collision. Assert `ZipValidationError` and no returned partial map on invalid input.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run --coverage.enabled false tests/integration/s05-t10.test.ts`; confirm those assertions fail for the missing interface.
- [ ] **Step 3: Implement** `readArchiveForApply` by sharing the current bounded entry scan with `validateZipArchive`, comparing the complete recomputed manifest before returning bytes. Preserve the existing validation codes and limits.
- [ ] **Step 4: Rerun** the S05-T03 and S05-T10 focused suites; require all assertions to pass.
- [ ] **Step 5: Commit** the archive-read and test slice.

### Task 2: Reserve one project ID and prepare binary blobs

**Files:** Create `packages/db/migrations/0008-import-project-reservation.sql` after checking the next free migration number; modify `packages/db/src/schema/core.ts` and `packages/db/src/repositories/import-jobs.ts`; create `apps/jobs/src/imports/apply-project.ts`; test in `tests/integration/s05-t10.test.ts`.

**Interfaces:** Produce `ImportJobRepository.reserveProjectId(jobId: string): Promise<ImportJobView>` for a `validated` job, storing a nullable `pending_project_id` before object writes and exposing it only on the internal repository view. Produce `prepareImportBlobs(storage: StorageAdapter, job: ImportJobView, files: Map<string, Buffer>): Promise<Map<string, string>>`, mapping each manifest-declared binary path to its verified content-addressed key. The public `ImportJobView` DTO must not expose the pending ID or object keys.

- [ ] **Step 1: Write failing tests** that repeated reservations yield one ID, storage failure leaves the job validated with that ID and no project row, and retry writes the same keys. Assert no object key appears in public job status.
- [ ] **Step 2: Run** the S05-T10 integration file; confirm the reservation and retry assertions fail.
- [ ] **Step 3: Add** the migration and typed repository method. Reserve the ID before the first PUT; update the manifest/status CHECK so `succeeded` retains the validated manifest for audit.
- [ ] **Step 4: Add** blob preparation and verify each returned size/SHA-256. Leave the durable job reservation in place on storage failure so a retry can reconcile deterministic keys.
- [ ] **Step 5: Rerun** the S05-T10 integration file and S05-T03/T12 suites; require all assertions to pass.
- [ ] **Step 6: Commit** the reservation/blob slice.

### Task 3: Commit project state and run the apply pass

**Files:** Modify `apps/jobs/src/imports/apply-project.ts`, `apps/jobs/src/main.ts`, `packages/db/src/repositories/import-jobs.ts`, and `docs/contracts/storage-and-revisions.md`; test in `tests/integration/s05-t10.test.ts`, `tests/regression/pro-02/s05-t10.test.ts`, and `tests/regression/pro-10/s05-t10.test.ts`.

**Interfaces:** Produce `applyValidatedImport(db: DatabaseClient, storage: StorageAdapter, jobId: string): Promise<ImportJobView>` and `runImportApplyPass(db: DatabaseClient, storage: StorageAdapter, limit?: number): Promise<{succeeded: number; failed: number; retried: number}>`. Use the existing public `ImportJobView` DTO for status; do not add a project creation HTTP route in this task.

- [ ] **Step 1: Write failing real-service tests** for nested folders, main `.tex`, a second text file, PNG blob, canonical Yjs replay, and one `projectId` on duplicate/concurrent calls. Assert no project/node/text row after an invalid hash, unsafe path, decompression limit, storage failure or injected SQL failure. Include the five Review Focus conditions above.
- [ ] **Step 2: Run** the S05-T10 integration and PRO-02/PRO-10 files; confirm the missing apply interface fails.
- [ ] **Step 3: Implement** a transaction that locks the job row, returns its existing project if `succeeded`, otherwise requires `validated`, inserts project and parent-before-child nodes using stable UUIDs, writes one Yjs update with sequence 1 per text file, chooses root `main.tex` or the first sorted `.tex` as main file, and changes the job to `succeeded` with its project ID in the same commit. Reject a mismatched archive/manifest before the transaction. Use the reserved project ID and prepared blob keys from Task 2.
- [ ] **Step 4: Wire** a bounded private `imports:apply --once` jobs pass; test retry after process interruption.
- [ ] **Step 5: Add** a 14-day succeeded-archive sweep using the durable job row and its sweep flag; test that current project blobs remain.
- [ ] **Step 6: Run** the three S05-T10 files plus S05-T03/T12 regression, then typecheck, lint, build, planning lint, secret/artifact checks and the repository-wide suite. Record exact commands/results in `docs/test-reports/s05-t10.md` and synchronize task/index/roadmap/progress/feature evidence and affected map cards.
- [ ] **Step 7: Commit** only after fresh verification; `done` still requires independent co-maintainer review.

## Self-review

The three tasks cover archive re-verification, durable object preparation, atomic project state, retry/denial, private runner and archive retention from the approved spec. The five Review Focus cases are assigned to Tasks 1–3. `pending_project_id` is separate from the existing successful `project_id` foreign key, so a failed pre-commit attempt does not claim that a project exists.
