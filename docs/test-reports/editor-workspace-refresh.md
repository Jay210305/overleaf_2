# Editor workspace usability refresh

Date: 2026-10-19. Scope: approved maintenance of S04-T01, S06-T08/T09 and S08-T09 UI surfaces; no task or release status change. Independent co-maintainer review remains pending.

## Scope and decisions

The user approved a neutral charcoal workspace with restrained green accents, a simpler toolbar, readable source, collapsible comments, clear editing state and usable compact views. Existing Code/Visual buttons depended on utility classes absent from the stylesheet. They now have explicit component styling and bounded SVG dimensions; no dependency was added.

The header keeps Share and Recompile visible, groups secondary tools in a native disclosure, and moves engine/cache settings into compilation options. Compilation remains mounted when PDF preview is hidden. On widths up to 900px, Files/Editor/PDF controls change visibility while retaining mounted editor and comment state. Selecting a file returns to the editor. Comments use a native disclosure and retain drafts when closed. The existing live connection and durable-save status remain authoritative; the preview action is labeled Start editing.

PDF controls use consistent styles and accessible names. Empty, pending and failed states explain the next action. A failed subsequent compile retains the prior PDF and displays an outdated banner. The compiled document and server authorization paths are unchanged. No source storage, schema, provider, or executor change is included.

## Changed surfaces and environment

- `apps/web/src/features/projects/workspace.tsx`, `styles.css`: header, workspace sizing, compact navigation, comments, preview status.
- `features/compilation/compile-controls.tsx`, `features/pdf/pdf-viewer.tsx`: presentation and labels around existing operations.
- `features/visual/mode-switch.tsx`, `features/collab/live-document.tsx`: explicit mode styling and editing/connection labels.
- Regression journeys were adapted to the new Tools/Comments disclosures and Start editing label.
- Working branch: `codex/fix-compile-worker-drain`. This maintenance slice does not initiate a new sprint. Initial inspected HEAD was `3f3a755`; another contributor committed worker changes during the session. Their changes and the supplied ZIP remain preserved.
- Windows PowerShell, Node 24, installed pnpm and Edge; existing local PostgreSQL/Redis/MinIO/Mailpit. No external account or private project content is used for screenshots.

## Verification

| Command / check | Observed result |
|---|---|
| New layout tests before implementation | Expected failure, 3/3: compilation disappeared with PDF, Tools absent, Start editing absent |
| `pnpm exec vitest run tests/integration/editor-workspace-layout.test.tsx tests/integration/s06-t08.test.ts tests/integration/s06-t09.test.ts tests/integration/s11-t07.test.ts tests/regression/int-05/s12-t05-mount.test.tsx --coverage.enabled=false --no-cache` | PASS, 25/25; stable workspace-local TEMP/TMP used after sandbox temporary-module ENOENT |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS after correcting the test query options |
| `pnpm build` | PASS; existing Vite chunk-size warning remains |
| `pnpm exec playwright test --config playwright.editor-layout.config.ts --project=edge` | PASS, Edge at 1440×900 and 390×844; local Vite server and browser run outside the restrictive sandbox. The isolated presentation configuration is versioned for reproduction |
| Visual review | Reviewed `test-results/editor-layout-desktop.png`, `editor-layout-mobile.png` and mobile PDF screenshot; fixed inherited mobile navigation order and page-input styling |
| Accessibility | Fixture workspace axe scan: zero serious/critical findings for WCAG 2 A/AA, 2.1 AA and 2.2 AA tags; Tools Escape/focus behavior exercised |
| Full `pnpm test -- --no-cache` | FAIL, 507 files passed / 4 failed; 1,825 tests passed / 4 failed, 695.19s. Three unchanged executor failures plus an auth test that passes in isolation (details below) |
| `pnpm format:check`, scoped Prettier check / `git diff --check` | PASS |
| Final `pnpm --filter @latex-collab/web build` | PASS after the final style refinements; chunk-size warning remains |
| `python scripts/plan_lint.py` / `python scripts/build_icm_map.py` | PASS; planning sources unchanged, map inventory refreshed |

The browser fixture verifies presentation, source-preserving mode switching, no horizontal document overflow, retained comment drafts, and PDF/Editor switching. It does not establish real TeX compilation, persistence or live collaboration. Service-backed existing journeys are separate checks. Initial sandbox test/service/browser failures were environmental; final commands above use the appropriate local execution context.

Three unrelated failures were reproduced independently: `pnpm exec vitest run tests/security/executor-isolation.test.ts tests/integration/s15-t13.test.ts --coverage.enabled=false --no-cache` (8 passed, 2 failed) reports `ADV-01: Contains shell escape attempts by strictly disabling shell execution` and `executes valid TeX job producing output.pdf and sanitized compile.log`. Both throw `Directory traversal attempt rejected: main.tex` at `apps/jobs/src/compilation/isolated-executor.ts:177`. The separate `tests/integration/s15-t02.test.ts` run (1 passed, 1 failed) reports `handles memory and buffer exhaustion safely`, which expects a limit error but receives the same containment rejection for `large1.tex`. The containment check appends `/` to a Windows path and then compares it to `resolve()`'s backslash path. The same code is present in initial base `3f3a755`; this UI slice does not modify it. Tracked as GAP-42, without weakening the containment check.

The fourth failure is `tests/regression/acc-01/s02-t05.test.ts`, `renders /login as a real form`: its immediate submit-button query finds no matching accessible button after the heading resolves. `pnpm exec vitest run tests/regression/acc-01/s02-t05.test.ts --coverage.enabled=false --no-cache` passes all 5 tests in isolation. The auth/router code and this auth test are unchanged; the full-run timing/shared-state cause remains unverified (GAP-43). No full-suite PASS is claimed.

The full service-backed browser matrix and the existing real comment/live-edit browser journeys were not rerun in this maintenance slice. Their selectors were updated for the new disclosures and action label; fixture presentation evidence is not substituted for those journeys.

## Remaining review

No deployment, merge, or release approval is implied. Actual effort was not measured. Maintainers should review the interface and the scoped evidence before accepting this maintenance slice. Next independent work remains the existing provider/production blockers in `docs/progress/open-gaps.md`.
