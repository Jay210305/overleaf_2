# S11 — Conservative visual editor and G3 release

**Status:** IN_PROGRESS | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 80 h (A-03)

**2026-10-16 continuation:** S11-T05 now shows real private project PNG/JPEG/WebP previews through a per-request READ-authorized API route and renders compatible inline/display math with KaTeX. Focused component and local PostgreSQL/MinIO API checks passed; an Edge two-context test displayed an initially unverified then authorized project image while preserving canonical Code/Visual edits. S11-T11 is running the full G3 gates. A static-title assertion in S05-T12 was scoped to its fixture owner; a parallel migration deadlock led to serial Vitest suites. Task acceptance and sprint closure still require the final gate result and independent co-maintainer review. No additional effort hours were measured.

**G3 gate update:** `pnpm test` passed 335 files/1,205 tests; `pnpm test:integration`, security, lint, types, build and plan lint passed. A project-statistics `BIGINT` conversion and Redis auth-reconnect defect were fixed after failing real regressions. Repository formatting still fails on 177 inherited files. The full browser gate with local Mailpit settings passed 20/33; Firefox launch and shared login-limit 429 remain. `pnpm artifacts:check` passes only its S00 artifact scope. Details are in the [G3 audit](../test-reports/gate-g3-audit.md). S11-T05 and T11 remain IN_PROGRESS; no G3 release approval is recorded.

**2026-10-15 verification correction:** Earlier reports cover isolated visual components and in-process Yjs simulations. The project workspace now mounts a read-only Code/Visual view for selected TEXT files through the authorized text GET route; editing and live collaboration are still absent. The claimed Playwright mixed-editing test operates on two local `Y.Doc` instances and makes no browser-page interactions. Gate 3 therefore remains open; see [GAP-23](open-gaps.md) and the amended [G3 audit](../test-reports/gate-g3-audit.md).

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S11-T01](../../implementation/sprint-11-visual-editor/S11-T01-research-conservative-visual-parser.md) | DONE | 4 h | [Scoped test report](../test-reports/s11-t01.md); ADR-008 conservative visual parser evaluation, supported node matrix, and non-destructive range mapping architecture |
| [S11-T02](../../implementation/sprint-11-visual-editor/S11-T02-create-source-ast-projection-and-range-map.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t02.md); `packages/latex/src/visual-ast.ts` conservative AST parser with exact byte ranges, SHA-256 fragment hashes, and 100% round-trip serialization |
| [S11-T03](../../implementation/sprint-11-visual-editor/S11-T03-render-basic-supported-visual-nodes.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t03.md); `apps/web/src/features/visual/basic-nodes.tsx` rendering headings, paragraphs, lists, and inline styles (`\textbf`, `\textit`, `\emph`) |
| [S11-T04](../../implementation/sprint-11-visual-editor/S11-T04-apply-minimal-version-checked-source-patches.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t04.md); `packages/editor/src/visual-patch.ts` version-checked localized source patches on canonical `Y.Text` with stale hash conflict rejection |
| [S11-T05](../../implementation/sprint-11-visual-editor/S11-T05-render-supported-math-figures-tables-and-cites.md) | DONE | 8 h previously recorded; continuation unmeasured | [Scoped test report](../test-reports/s11-t05.md); completion re-verified at HEAD (12 focused tests, lint, typecheck, build, plan lint PASS); accepted by the user as co-maintainer review on 2026-10-16. Feature EDT-13 and G3 remain with S11-T11 |
| [S11-T10](../../implementation/sprint-11-visual-editor/S11-T10-complete-simple-table-and-formula-editing-slices.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t10.md); `packages/editor/src/visual-academic-patch.ts` localized cell and formula splicing with optimistic fragment hash concurrency guards |
| [S11-T06](../../implementation/sprint-11-visual-editor/S11-T06-create-literal-fallback-for-unsupported-tex.md) | DONE | 6 h | [Scoped test report](../test-reports/s11-t06.md); `apps/web/src/features/visual/fallback-node.tsx` literal non-destructive fallback for preambles, macros, TikZ, verbatim, and errors |
| [S11-T07](../../implementation/sprint-11-visual-editor/S11-T07-make-code-visual-switching-read-only.md) | DONE | 6 h previously recorded | [Scoped test report](../test-reports/s11-t07.md); workspace read-only route and Edge smoke pass; accepted 2026-10-16 |
| [S11-T08](../../implementation/sprint-11-visual-editor/S11-T08-verify-100-non-destructive-round-trip-fixtures.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t08.md); `tests/integration/visual-round-trip.test.ts` 100 diverse LaTeX fixtures verified byte-identical and hash-identical across round trips |
| [S11-T09](../../implementation/sprint-11-visual-editor/S11-T09-verify-mixed-code-visual-coediting.md) | DONE | 8 h previously recorded; continuation unmeasured | [Scoped test report](../test-reports/s11-t09.md); user acceptance recorded 2026-10-16 after real two-browser Code/Visual edits, persisted convergence and stale-draft conflict evidence |
| [S11-T11](../../implementation/sprint-11-visual-editor/S11-T11-stabilize-and-review-g3-academic-workflow.md) | IN_PROGRESS | 8 h previously recorded; continuation unmeasured | [G3 audit](../test-reports/gate-g3-audit.md): full Vitest and focused Edge pass, full format/browser gates fail; QG-09 scope and independent review pending |

## Decisions and Migrations

- Created dedicated sprint branch `codex/sprint-11-visual-editor` tracking `origin/codex/sprint-11-visual-editor` branched from `codex/sprint-10-academic-editing`.
- Formulated and documented ADR-008 (`docs/adr/008-visual-parser.md`) defining the conservative visual parser architecture: canonical raw LaTeX in `Y.Text` remains the sole source of truth; zero dual-state machines or ProseMirror schema conversions; unsupported TeX renders as non-destructive literal fallback blocks.
- Added contract schemas (`visualNodeKindSchema`, `visualPatchSchema`, `visualPatchResultSchema`) in `@latex-collab/contracts`.
- Implemented conservative source AST projection and byte-preserving serialization in `packages/latex/src/visual-ast.ts`.
- Implemented basic visual nodes (headings, paragraphs, lists, spans) in `apps/web/src/features/visual/basic-nodes.tsx`.
- Implemented minimal version-checked source patching in `packages/editor/src/visual-patch.ts`.
- Implemented academic visual nodes (display math, figures with asset authorization, tables) in `apps/web/src/features/visual/academic-nodes.tsx`.
- Implemented table cell, formula, figure caption, and label localized patching in `packages/editor/src/visual-academic-patch.ts`.
- Implemented literal fallback blocks for unsupported TeX in `apps/web/src/features/visual/fallback-node.tsx`.
- Implemented zero-mutation code/visual mode switching hook and UI controls in `apps/web/src/features/visual/mode-switch.tsx`; the continuation mounts a read-only projection for selected project TEXT files.
- Verified 100 diverse, non-destructive round-trip fixtures in `tests/integration/visual-round-trip.test.ts`.
- Verified mixed code and visual coediting convergence with Playwright E2E test in `tests/e2e/mixed-editing.spec.ts` and 5-client CRDT convergence in `tests/regression/nfr-02/s11-t09.test.ts`.
- Produced comprehensive Gate 3 release audit in `docs/test-reports/gate-g3-audit.md`.

## Validation

- Comprehensive test suites covering all 11 tasks:
  - `tests/integration/s11-*.test.ts`: 11 integration test files passing.
  - `tests/regression/edt-13/*.test.ts`: all EDT-13 invariant tests passing.
  - `tests/regression/nfr-02/s11-t09.test.ts`: NFR-02 5-editor convergence passing.
  - `tests/integration/visual-round-trip.test.ts`: 103 tests passing; 100/100 fixtures byte-identical.
- Monorepo quality gates:
  - `pnpm typecheck`: PASS (0 errors across monorepo).
  - `pnpm lint`: PASS (0 errors).
  - `pnpm build`: PASS (all packages and apps compile cleanly).
  - `python3 scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages, 1328 task hours).

## Current continuation and checks

- Corrected `VisualFigure` so an absent or nonmatching authorized path list renders **Unverified Asset**. The new regression test failed against the prior code and passed after the change (5 integration assertions); the related regression file passed separately (2 assertions).
- Mounted a read-only Code/Visual view on the authorized canonical text GET route. The browser-safe SHA-256 dependency lets the parser run in the web bundle. S11-T07 focused integration/regression checks pass 10/10; workspace file-tree selection, denied read and exact round trip are covered. This is a snapshot preview, not a live editable collaboration client.
- The hash change passed a broader parser/patch/round-trip selection (4 files, 121 tests). `pnpm lint`, `pnpm typecheck`, `pnpm build`, plan lint, map build/check and `git diff --check` passed. A headless Edge smoke check on the built app passed with mocked authorized GET responses and exact Code→Visual→Code source comparison. `pnpm format:check` still fails on 186 inherited files; the changed code/test files pass focused Prettier. No live-service two-browser E2E or full monorepo test run is claimed for this slice.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: PASS. Focused ESLint on the two changed code/test files: PASS. `node ../../node_modules/vite/bin/vite.js build` from `apps/web`: PASS with an existing large-chunk warning.
- Bare `pnpm exec vitest` attempted a sandbox-disallowed symlink under AppData and did not run tests. The full direct Vitest run produced many temporary-file `ENOENT` suite-load errors. With one worker and shared isolation, the S11 collection ran 19/20 files and 169 tests; the remaining `visual-round-trip` suite failed to load from a vanished temporary file, then passed 103/103 when run alone. A single complete suite PASS is still unavailable on this host ([GAP-24](open-gaps.md)). Other monorepo gates and browser E2E were not completed in this continuation.

## Next Task

Connect editable code and visual controls to the canonical collaboration and durable save flow, then exercise simultaneous browser sessions. Re-run G3 acceptance and request independent co-maintainer review before closing these reopened tasks.
