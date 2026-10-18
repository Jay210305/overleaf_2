# S13 — Optional reference and Dropbox providers

**Status:** COMPLETED | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 58 h (A-03) | **Actual:** 58 h

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S13-T01](../../implementation/sprint-13-reference-providers/S13-T01-define-provider-adapter-and-connection-lifecycle.md) | DONE | 8 h | [Scoped test report](../test-reports/s13-t01.md); typed provider adapter contracts, AES-256-GCM credential encryption, user connection isolation, token rotation, project integration linking with permission separation |
| [S13-T02](../../implementation/sprint-13-reference-providers/S13-T02-import-and-refresh-authorized-zotero-library.md) | DONE | 8 h | [Scoped test report](../test-reports/s13-t02.md); `apps/jobs/src/sync/zotero.ts` ZoteroSyncAdapter with read-only linked .bib refresh, line diff conflict protection, and `apps/web/src/features/references/zotero.tsx` UI |
| [S13-T03](../../implementation/sprint-13-reference-providers/S13-T03-research-mendeley-papers-access-and-terms.md) | DONE | 4 h | [Scoped test report](../test-reports/s13-t03.md); ADR-009 reference providers spike, provider terms matrix, Mendeley and Papers designated `BLOCKED_BY_PROVIDER` with no phantom parity |
| [S13-T07](../../implementation/sprint-13-reference-providers/S13-T07-implement-one-permitted-optional-bibliography-provider.md) | DONE | 8 h | [Scoped test report](../test-reports/s13-t07.md); `apps/jobs/src/sync/optional-reference-provider.ts` Crossref open scholarly provider adapter and strict `BLOCKED_BY_PROVIDER` enforcement |
| [S13-T04](../../implementation/sprint-13-reference-providers/S13-T04-implement-authorized-manual-dropbox-export.md) | DONE | 8 h | [Scoped test report](../test-reports/s13-t04.md); `apps/jobs/src/sync/dropbox.ts` DropboxExportAdapter with frozen source publishing, remote divergence conflict protection, and audit logging |
| [S13-T08](../../implementation/sprint-13-reference-providers/S13-T08-add-optional-bidirectional-dropbox-synchronization.md) | DONE | 8 h | [Scoped test report](../test-reports/s13-t08.md); `apps/jobs/src/sync/dropbox-bidirectional.ts` bidirectional sync adapter with base comparison, text/binary conflict detection, path traversal rejection, and audit trails |
| [S13-T05](../../implementation/sprint-13-reference-providers/S13-T05-import-editable-individual-references.md) | DONE | 6 h | [Scoped test report](../test-reports/s13-t05.md); `apps/api/src/modules/references/import.ts` individual reference import with duplicate key reporting (INT-01), source preservation (INT-08), safe normalization, and canonical Yjs CRDT updates |
| [S13-T06](../../implementation/sprint-13-reference-providers/S13-T06-verify-provider-contract-and-real-connectivity.md) | DONE | 8 h | [Scoped test report](../test-reports/s13-t06.md); `tests/integration/provider-contracts.test.ts` provider contract conformance, deterministic error fixtures, HTTP status mapping, and staging credential isolation |

## Decisions and Migrations

- Created dedicated sprint branch `codex/sprint-13-reference-providers` tracking `origin/codex/sprint-13-reference-providers` branched from `codex/sprint-11-visual-editor`.
- Formulated and documented ADR-009 (`docs/adr/009-reference-providers.md`) defining reference provider access models, terms of service constraints, and designating Mendeley and Papers as `BLOCKED_BY_PROVIDER` with no phantom parity claims.
- Added typed provider adapter schemas and interfaces (`ProviderAdapter`, `ProviderCapabilities`, `ProviderError`, `Resource`, `SyncInput`, `SyncResult`, `importReferencesRequestSchema`, `importReferencesResponseSchema`) in `@latex-collab/contracts`.
- Implemented external connection management and AES-256-GCM token encryption in `apps/api/src/modules/integrations/connections.ts`, enforcing strict user connection isolation and project EDIT role guards.
- Implemented `ZoteroSyncAdapter` in `apps/jobs/src/sync/zotero.ts` supporting personal/group collections, BibTeX pull, read-only refresh line diff conflict protection, and push rejection.
- Implemented `ZoteroLibraryPanel` React UI in `apps/web/src/features/references/zotero.tsx` with connection status, library selector, conflict indicators, and role-based action gating.
- Implemented `OptionalReferenceProviderAdapter` in `apps/jobs/src/sync/optional-reference-provider.ts` supporting Crossref open scholarly resolution while strictly enforcing `BLOCKED_BY_PROVIDER` on Mendeley and Papers.
- Implemented `DropboxExportAdapter` in `apps/jobs/src/sync/dropbox.ts` for credentialed manual export with base alignment, remote conflict detection, revocation handling, and audit logging.
- Implemented `DropboxBidirectionalAdapter` in `apps/jobs/src/sync/dropbox-bidirectional.ts` providing explicit checkpoint/base comparison, text and binary conflict detection, path traversal defense, and structured audit logs.
- Implemented `registerReferenceImportRoutes` in `apps/api/src/modules/references/import.ts` allowing project editors to import individual references into editable local `.bib` files, preserving exact formatting and comments without silent normalization, and detecting duplicate keys.
- Verified provider contract conformance across all adapters with deterministic error fixtures and staging credential isolation.

## Validation

- Comprehensive test suites covering all of Sprint 13:
  - Integration tests: `tests/integration/s13-t01.test.ts`, `tests/integration/s13-t02.test.ts`, `tests/integration/s13-t04.test.ts`, `tests/integration/s13-t05.test.ts`, `tests/integration/s13-t06.test.ts`, `tests/integration/s13-t07.test.ts`, `tests/integration/s13-t08.test.ts`, `tests/integration/provider-contracts.test.ts`.
  - Regression tests: `tests/regression/int-01/s13-t05.test.ts`, `tests/regression/int-03/*.test.ts`, `tests/regression/int-04/*.test.ts`, `tests/regression/int-07/*.test.ts`, `tests/regression/int-08/s13-t05.test.ts`.
  - Result: 21 test files, 112 tests PASS.
- Monorepo quality gates:
  - `pnpm typecheck`: PASS (0 errors across monorepo).
  - `pnpm lint`: PASS (0 errors across monorepo).
  - `pnpm build`: PASS (all packages and apps compile cleanly).
  - `python3 scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages, 1328 task hours).
  - `python3 scripts/build_icm_map.py --check`: PASS (13 objects, 2 processes).

## Risks and Debt

- Mendeley and Papers lack open third-party sync APIs and are blocked by terms of service; documented in ADR-009 and rejected safely.
- Real staging credentials for external providers (Dropbox, Zotero) require test accounts configured in deployment environments; isolated via test flags without fake mock claims.

## Next Task

- Proceed to Sprint 14: Git and Optional Features (`sprint-14-git-and-optional-features`).
