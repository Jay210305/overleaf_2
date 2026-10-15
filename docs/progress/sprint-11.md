# S11 — Conservative visual editor and G3 release

**Status:** COMPLETED | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 80 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S11-T01](../../implementation/sprint-11-visual-editor/S11-T01-research-conservative-visual-parser.md) | DONE | 4 h | [Scoped test report](../test-reports/s11-t01.md); ADR-008 conservative visual parser evaluation, supported node matrix, and non-destructive range mapping architecture |
| [S11-T02](../../implementation/sprint-11-visual-editor/S11-T02-create-source-ast-projection-and-range-map.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t02.md); `packages/latex/src/visual-ast.ts` conservative AST parser with exact byte ranges, SHA-256 fragment hashes, and 100% round-trip serialization |
| [S11-T03](../../implementation/sprint-11-visual-editor/S11-T03-render-basic-supported-visual-nodes.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t03.md); `apps/web/src/features/visual/basic-nodes.tsx` rendering headings, paragraphs, lists, and inline styles (`\textbf`, `\textit`, `\emph`) |
| [S11-T04](../../implementation/sprint-11-visual-editor/S11-T04-apply-minimal-version-checked-source-patches.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t04.md); `packages/editor/src/visual-patch.ts` version-checked localized source patches on canonical `Y.Text` with stale hash conflict rejection |
| [S11-T05](../../implementation/sprint-11-visual-editor/S11-T05-render-supported-math-figures-tables-and-cites.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t05.md); `apps/web/src/features/visual/academic-nodes.tsx` rendering display math with PDF authority indicator, figure asset verification, and table grids |
| [S11-T10](../../implementation/sprint-11-visual-editor/S11-T10-complete-simple-table-and-formula-editing-slices.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t10.md); `packages/editor/src/visual-academic-patch.ts` localized cell and formula splicing with optimistic fragment hash concurrency guards |
| [S11-T06](../../implementation/sprint-11-visual-editor/S11-T06-create-literal-fallback-for-unsupported-tex.md) | DONE | 6 h | [Scoped test report](../test-reports/s11-t06.md); `apps/web/src/features/visual/fallback-node.tsx` literal non-destructive fallback for preambles, macros, TikZ, verbatim, and errors |
| [S11-T07](../../implementation/sprint-11-visual-editor/S11-T07-make-code-visual-switching-read-only.md) | DONE | 6 h | [Scoped test report](../test-reports/s11-t07.md); `apps/web/src/features/visual/mode-switch.tsx` zero-mutation code <-> visual switching preserving 100% byte fidelity and SHA-256 hash |
| [S11-T08](../../implementation/sprint-11-visual-editor/S11-T08-verify-100-non-destructive-round-trip-fixtures.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t08.md); `tests/integration/visual-round-trip.test.ts` 100 diverse LaTeX fixtures verified byte-identical and hash-identical across round trips |
| [S11-T09](../../implementation/sprint-11-visual-editor/S11-T09-verify-mixed-code-visual-coediting.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t09.md); `tests/e2e/mixed-editing.spec.ts` and NFR-02 test suite verifying five simultaneous code and visual editors converge to identical source |
| [S11-T11](../../implementation/sprint-11-visual-editor/S11-T11-stabilize-and-review-g3-academic-workflow.md) | DONE | 8 h | [Scoped test report](../test-reports/s11-t11.md); `docs/test-reports/gate-g3-audit.md` full Gate 3 Editorial Parity release audit covering COL-11, EDT-08-13, CMP-06-08, NFR-02, and PL-05 |

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
- Implemented zero-mutation code/visual mode switching hook and UI controls in `apps/web/src/features/visual/mode-switch.tsx`.
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

## Next Task

Sprint 11 is completed. Gate 3 Editorial Parity is audited and passed. Ready for Sprint 12 (`sprint-12-github-sync`).
