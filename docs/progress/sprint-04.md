# S04 — Code editor and durable text

**Status:** COMPLETED | **Owner:** Julio (proposed A-02) | **Estimate:** 72 h | **Actual hours:** 72 h  
**Branch:** `codex/sprint-04-code-editor` tracking `origin/codex/sprint-04-code-editor` | **Base commit:** `f3684f7`

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S04-T01](../../implementation/sprint-04-code-editor/S04-T01-create-latex-codemirror-extensions.md) | DONE | 8 h | [s04-t01 report](../test-reports/s04-t01.md), `tests/integration/s04-t01.test.ts`, `tests/regression/edt-01/s04-t01.test.ts` PASS |
| [S04-T02](../../implementation/sprint-04-code-editor/S04-T02-create-canonical-text-document-service.md) | DONE | 8 h | [s04-t02 report](../test-reports/s04-t02.md), `tests/integration/s04-t02.test.ts`, `tests/regression/edt-02/s04-t02.test.ts`, `tests/regression/nfr-01/s04-t02.test.ts` PASS |
| [S04-T09](../../implementation/sprint-04-code-editor/S04-T09-persist-and-replay-canonical-text-updates.md) | DONE | 8 h | [s04-t09 report](../test-reports/s04-t09.md), `tests/integration/s04-t09.test.ts`, `tests/regression/edt-02/s04-t09.test.ts`, `tests/regression/nfr-01/s04-t09.test.ts` PASS |
| [S04-T10](../../implementation/sprint-04-code-editor/S04-T10-implement-rest-text-state-version-contract.md) | DONE | 8 h | [s04-t10 report](../test-reports/s04-t10.md), `tests/integration/s04-t10.test.ts`, `tests/regression/edt-02/s04-t10.test.ts`, `tests/regression/col-03/s04-t10.test.ts` PASS |
| [S04-T03](../../implementation/sprint-04-code-editor/S04-T03-connect-actual-save-status-and-retries.md) | DONE | 8 h | [s04-t03 report](../test-reports/s04-t03.md), `tests/integration/s04-t03.test.ts`, `tests/regression/edt-02/s04-t03.test.ts`, `tests/regression/nfr-01/s04-t03.test.ts` PASS |
| [S04-T04](../../implementation/sprint-04-code-editor/S04-T04-implement-file-tabs-and-navigation.md) | DONE | 6 h | [s04-t04 report](../test-reports/s04-t04.md), `tests/integration/s04-t04.test.ts`, `tests/regression/edt-03/s04-t04.test.ts` PASS |
| [S04-T05](../../implementation/sprint-04-code-editor/S04-T05-implement-local-undo-search-and-shortcuts.md) | DONE | 6 h | [s04-t05 report](../test-reports/s04-t05.md), `tests/integration/s04-t05.test.ts`, `tests/regression/edt-04/s04-t05.test.ts`, `tests/regression/edt-08/s04-t05.test.ts` PASS |
| [S04-T06](../../implementation/sprint-04-code-editor/S04-T06-enforce-read-only-and-metadata-concurrency.md) | DONE | 6 h | [s04-t06 report](../test-reports/s04-t06.md), `tests/integration/s04-t06.test.ts`, `tests/regression/col-03/s04-t06.test.ts`, `tests/regression/edt-02/s04-t06.test.ts` PASS |
| [S04-T07](../../implementation/sprint-04-code-editor/S04-T07-create-text-and-binary-checkpoints.md) | DONE | 8 h | [s04-t07 report](../test-reports/s04-t07.md), `tests/integration/s04-t07.test.ts`, `tests/regression/col-10/s04-t07.test.ts`, `tests/regression/nfr-06/s04-t07.test.ts` PASS |
| [S04-T08](../../implementation/sprint-04-code-editor/S04-T08-verify-persistent-unicode-editing.md) | DONE | 6 h | [s04-t08 report](../test-reports/s04-t08.md), `tests/e2e/editor-persistence.spec.ts`, `tests/integration/s04-t08.test.ts`, `tests/regression/edt-01/s04-t08.test.ts`, `tests/regression/edt-02/s04-t08.test.ts`, `tests/regression/nfr-01/s04-t08.test.ts` PASS |

## Decisions and Migrations

1. **Dedicated Workspace Package `@latex-collab/editor`**:
   - Encapsulates CodeMirror 6 extensions, keymaps, syntax highlighting, scoped undo manager, and search.
   - Pinned `yjs@13.6.27` and `@codemirror/*` libraries.
2. **PostgreSQL Canonical CRDT Storage**:
   - `text_documents`, `crdt_updates`, `crdt_snapshots` form the single source of truth for text documents.
   - Monotonic per-file lock allocation under transaction; compaction into snapshots every 50 updates or 500 KB.
   - Zero divergence: single canonical CRDT byte stream, no secondary text columns.
3. **Save Lifecycle Invariant & Outage Handling**:
   - Client save coordinator transitions to `saved` only upon receipt of server `DurableAck`.
   - Transient outages (503 / network) preserve pending update queue without dropping edits and retry with exponential backoff.
4. **Server-Side Authorization & Concurrency**:
   - Every text and checkpoint operation enforces role authorization: OWNER/EDITOR can edit; VIEWER/REVIEWER denied with 403 `PROJECT_PERMISSION_DENIED` (`COL-03`).
   - Stale base state vector rejected with 409 `REVISION_CONFLICT` (`EDT-02`).
   - Stale metadata `If-Match` rejected with 412 `PRECONDITION_FAILED`.
5. **Keystroke Bloat Prevention & Structural Checkpoints**:
   - Keystrokes commit sequential CRDT updates without creating `project_revisions` rows.
   - Explicit save/compile checkpoints generate immutable revisions with deterministic SHA-256 manifests pinning text and binary files (`COL-10`, `NFR-06`).

## Validation

- Plan Lint: `python scripts/plan_lint.py` -> PASS.
- Architecture Map: `python scripts/build_icm_map.py --check` -> PASS.
- Unit & Regression Tests: `pnpm test` -> PASS.
- Integration Tests: `pnpm test:integration` -> PASS.
- Linting: `pnpm lint` -> PASS.
- Type Checking: `pnpm typecheck` -> PASS.
- Build: `pnpm build` -> PASS.

## Editor workspace maintenance — 2026-10-19

User-approved usability and appearance refresh spans the existing S04 editor, S06 preview/compile controls and S08 comments. Explicit mode styling, a simpler toolbar, retained editor state across compact views and collapsible comments are implemented. [Scoped evidence and review limits](../test-reports/editor-workspace-refresh.md) record actual checks. Independent co-maintainer review is pending; existing task statuses are unchanged. No new sprint is started and actual effort is not measured.

## Next Sprint

Sprint 05 — Assets, import, and export (`sprint-05-assets-import-export`).
