# S10 — Academic editing bibliography and SyncTeX

**Status:** COMPLETED | **Owner:** Julio (proposed A-02) | **Estimate:** 104 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S10-T01](../../implementation/sprint-10-academic-editing/S10-T01-add-tested-alternative-tex-profiles.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t01.md); verified pdflatex, xelatex, lualatex, and latex (pdfdvi) profiles with strict allowlists and security isolation |
| [S10-T02](../../implementation/sprint-10-academic-editing/S10-T02-compile-bibliography-and-complete-citations.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t02.md); bibliography backend detection (bibtex/biber), multi-pass compilation, and citation autocompletion |
| [S10-T03](../../implementation/sprint-10-academic-editing/S10-T03-index-bibtex-and-search-local-references.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t03.md); robust BibTeX indexing, local reference search by key/title/author/DOI/year, duplicate key detection, safe normalization |
| [S10-T04](../../implementation/sprint-10-academic-editing/S10-T04-implement-forward-inverse-synctex.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t04.md); forward and inverse SyncTeX navigation, coordinate transformation (TeX pt to PDF points/percentages), project authorization |
| [S10-T05](../../implementation/sprint-10-academic-editing/S10-T05-create-valid-academic-insertion-snippets.md) | DONE | 6 h | [Scoped test report](../test-reports/s10-t05.md); academic insertion snippet generators (figures, tables, equations, sections, math, links, labels, bib items) |
| [S10-T06](../../implementation/sprint-10-academic-editing/S10-T06-complete-environments-labels-and-file-paths.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t06.md); environment auto-closing, folding ranges, label and citation autocompletion, include/input file path suggestions |
| [S10-T07](../../implementation/sprint-10-academic-editing/S10-T07-report-documented-project-statistics.md) | DONE | 6 h | [Scoped test report](../test-reports/s10-t07.md); LaTeX word count excluding preamble/comments/commands, project statistics endpoint with file/byte counts and compile history |
| [S10-T08](../../implementation/sprint-10-academic-editing/S10-T08-implement-project-search-and-previewed-replacement.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t08.md); project-wide text search, ReDoS safe regex validation, previewed replacement, optimistic concurrency revision guards |
| [S10-T09](../../implementation/sprint-10-academic-editing/S10-T09-persist-editor-preferences-symbols-and-layout.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t09.md); categorized LaTeX symbol catalog, symbol palette UI, localStorage/profile editor preferences persistence |
| [S10-T10](../../implementation/sprint-10-academic-editing/S10-T10-verify-bibliography-pdf-synctex-and-keymaps.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t10.md); integrated academic editor verification, multi-file citation resolution, SyncTeX coordinates, custom keymap navigation |
| [S10-T11](../../implementation/sprint-10-academic-editing/S10-T11-add-local-spell-checking-and-static-error-help.md) | DONE | 6 h | [Scoped test report](../test-reports/s10-t11.md); offline client-side spell checking masking TeX commands/math/comments, static LaTeX error catalog and offline help UI |
| [S10-T12](../../implementation/sprint-10-academic-editing/S10-T12-add-debounced-automatic-compilation.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t12.md); debounced auto-compile controller (500ms-10000ms, max 60s bounding), job queue coalescing preserving running executions |
| [S10-T13](../../implementation/sprint-10-academic-editing/S10-T13-implement-authorized-content-aware-compiler-cache.md) | DONE | 8 h | [Scoped test report](../test-reports/s10-t13.md); content-aware compiler cache key hashing manifest/engine/image, tenant boundary enforcement, manifest verification |
| [S10-T14](../../implementation/sprint-10-academic-editing/S10-T14-implement-clean-rebuild-and-retention-cleanup.md) | DONE | 6 h | [Scoped test report](../test-reports/s10-t14.md); clean rebuild auxiliary file purging, cache bypass, artifact retention manager enforcing 14-day expiry while protecting sources |

## Decisions and Migrations

- Created dedicated branch `codex/sprint-10-academic-editing` tracking `origin/codex/sprint-10-academic-editing`.
- Implemented tested alternative TeX profile definitions and argv builders in `apps/tex-executor/src/profiles.ts` for `pdflatex`, `xelatex`, `lualatex`, and `latex` (`-pdfdvi`), preventing shell injection and unsafe flags.
- Updated `apps/jobs/src/compilation/trusted-worker-executor.ts` to execute alternative TeX engines via `latexmk` profiles.
- Implemented bibliography backend detection (`bibtex` and `biber`) and log parsing in `apps/tex-executor/src/bibliography.ts`.
- Implemented citation extraction, cursor query detection, and duplicate key checking in `packages/editor/src/citations.ts`.
- Implemented BibTeX indexing, parser, reference search, and formatting normalization in `packages/latex/src/bib.ts` and UI in `apps/web/src/features/references/search.tsx`.
- Implemented SyncTeX parser and API routes (`POST /projects/:projectId/synctex/forward` and `POST /projects/:projectId/synctex/inverse`) in `apps/api/src/modules/synctex/routes.ts` with strict project-level authorization and coordinate transformation in `apps/web/src/features/pdf/source-navigation.ts`.
- Implemented academic LaTeX snippet generator in `packages/editor/src/snippets.ts` supporting figures, tables, math, sections, lists, and citations.
- Implemented LaTeX environment auto-closing, fold ranges, and completions (labels, citations, and include paths) in `packages/editor/src/completion.ts`.
- Implemented LaTeX word counting in `packages/latex/src/word-count.ts` ignoring preamble, comments, and commands, with project statistics API endpoint `GET /api/v1/projects/:projectId/statistics` in `apps/api/src/modules/projects/statistics.ts`.
- Implemented project-wide search and previewed replacement in `apps/api/src/modules/search/routes.ts` and `apps/web/src/features/search/project-search.tsx`, enforcing ReDoS protection and optimistic concurrency version checking.
- Implemented mathematical symbol catalog in `packages/editor/src/symbols.ts` and symbol palette / preferences UI in `apps/web/src/features/editor/preferences.tsx`.
- Implemented client-side offline spell checking in `packages/editor/src/spellcheck.ts` and static LaTeX error assistance in `apps/web/src/features/help/latex-help.tsx` with explicit opt-in for external AI suggestions.
- Implemented debounced auto-compilation controller in `apps/web/src/features/compilation/auto-compile.ts` and queue job coalescing in `apps/jobs/src/compilation/coalesce.ts`.
- Implemented authorized content-aware compiler caching in `apps/jobs/src/compilation/cache.ts` with SHA-256 fingerprinting of manifest, engine, image, and options, enforcing strict project-level boundary isolation (`ForeignArtifactAccessDeniedError`).
- Implemented clean rebuild auxiliary purging in `apps/jobs/src/compilation/clean.ts` and 14-day artifact retention cleanup in `apps/jobs/src/maintenance/artifacts.ts`.

## Validation

- Comprehensive test suite covering all 14 tasks: 44 test files, 145 tests PASS across unit, integration, and regression suites.
- Monorepo quality gates:
  - `pnpm typecheck`: PASS (0 errors across all 10 packages/apps).
  - `pnpm lint`: PASS (0 errors, boundary checks pass).
  - `pnpm build`: PASS (all packages and applications build cleanly).
  - `python3 scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages, 1328 task hours).
  - `python3 scripts/build_icm_map.py --check`: PASS (ICM map and file inventories valid).

## Next Task

Sprint 10 is completed. Ready for Sprint 11 (`sprint-11-templates-publishing`).
