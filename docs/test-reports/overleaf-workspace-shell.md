# Overleaf-style workspace shell (view modes, sidebar, splitter)

Date: 2026-10-20. Scope: approved UI maintenance of the project workspace surfaces (S04-T01, S06-T08/T09, S08-T09). No task, sprint or release status change; independent co-maintainer review remains pending.

## Scope and decisions

The workspace now follows the Overleaf shell: a header with a sidebar toggle, the three layout modes (editor only, split, PDF only), presence, a Tools disclosure, Share and compilation controls; a file sidebar with FILES/OUTLINE tabs; a draggable splitter between the editor and the PDF pane; and a compilation console below the panes.

- View modes are state on the workspace (`mode-editor`, `mode-split`, `mode-pdf`). Panes stay mounted and are hidden with the `hidden` attribute, so the open document, the comment draft and the compiler state survive mode changes. Compilation stays reachable in every mode.
- The sidebar toggle collapses the sidebar to zero width at full height. Rendering keeps its width transition.
- The splitter supports pointer drag and arrow keys (20–80%). Its width lives in `--ws-editor-width` on the layout.
- Panes are wrapped in `.workspace-panes`, so the split ratio applies to the editor/PDF area instead of the whole layout including the sidebar. Without this, the sidebar width inflated the editor and squeezed the PDF pane (at 860px the PDF pane was ~175px wide).
- Responsive rules are one source of truth: the header wraps and lets the breadcrumb truncate; the split ratio is never re-fixed at a breakpoint; compilation error/warning counts are no longer hidden below 900px. Below 760px the sidebar becomes a drawer anchored to the layout, so it starts under the header and never covers the toggle, the mode switch or the breadcrumb. Above 760px it keeps its own column, so no pane is ever covered.
- The workspace starts with the sidebar collapsed below 760px (existing effect) and expands panes to full width.

No REST, WSS, object-store, schema, provider or executor contract is changed. Authorization, canonical Yjs text, commit-before-saved acknowledgements and revision inputs are untouched.

## Changed surfaces and environment

- `apps/web/src/features/projects/workspace.tsx`: `.workspace-panes` wrapper around the editor, splitter and PDF pane.
- `apps/web/src/styles.css`: single flex shell for the layout, pane wrapper, drawer breakpoint at 760px anchored to the layout, responsive header rules, removal of the legacy grid/absolute rules that hid or covered workspace controls.
- Supporting UI from the same slice (already present in the working tree): `features/files/file-tree.tsx` (row actions, menus, drag/drop), `features/compilation/compile-log-panel.tsx`, `features/editor/document-outline.tsx`, `features/collab/presence.tsx`, `features/sharing/share-dialog.tsx`, `features/pdf/pdf-viewer.tsx`, `features/files/binary-preview.tsx`.
- `tests/e2e/editor-layout.spec.ts`: shared presentation fixture plus a new responsive regression test.
- Local Linux (CachyOS), Node 26.11.1 (repository declares `>=24 <25`; pnpm warns but resolves), pnpm 11.25.0, Vite dev server on 127.0.0.1:5173, existing local PostgreSQL/Redis/MinIO/Mailpit containers. No external account or private project content is used for screenshots.

## Verification

| Command / check                                                                                                                                                     | Observed result                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run tests/integration/editor-workspace-layout.test.tsx tests/integration/overleaf-workspace-ui.test.tsx tests/regression/pro-04/s03-t05.test.ts`  | PASS, 23/23 (mode switching, sidebar collapse, outline jump, retained document and comment draft, console diagnostics, tree menus)                                                                                                                                                                                                                                                                        |
| `pnpm exec vitest run tests/integration/s05-t12.test.ts tests/integration/zip-project.test.ts tests/integration/s03-t05.test.ts`                                    | PASS, 27/27                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm exec vitest run tests/integration/editor-workspace-layout.test.tsx tests/integration/overleaf-workspace-ui.test.tsx tests/regression/col-03/s08-t03.test.tsx` | PASS, 23/23 after the `.workspace-panes` change                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm exec playwright test --config playwright.editor-layout.config.ts --project=chromium`                                                                          | PASS, 2/2. New test asserts the split ratio is relative to the pane area at 1440 and 860, that the sidebar keeps its own column there, and that at 700px the drawer starts below the header with the toggle and mode switch reachable and no horizontal overflow                                                                                                                                          |
| `pnpm typecheck`                                                                                                                                                    | PASS                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm lint`                                                                                                                                                         | PASS                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm exec prettier --check apps/web/src/features/projects/workspace.tsx apps/web/src/styles.css tests/e2e/editor-layout.spec.ts`                                   | PASS                                                                                                                                                                                                                                                                                                                                                                                                      |
| Manual browser review, Chromium                                                                                                                                     | 1440x900: three modes, editor expands full width in editor-only, PDF fills the pane in PDF-only, splitter drag and arrow keys move the divider, sidebar collapse/expand restores pane width. 860x800: header wraps, sidebar keeps its column, editor 52% of the pane area, PDF pane ~300px. 700x800 and 390x844: sidebar closed by default, drawer opens under the header and closes from the same toggle |
| Browser console                                                                                                                                                     | No application errors; only expected anonymous `401` session/notification responses and the unstarted chat WebSocket                                                                                                                                                                                                                                                                                      |

Vitest subset runs exit non-zero only because the global coverage threshold applies to a subset; every selected test passed. A full `pnpm test` run was not repeated in this slice.

Visual evidence captured in this slice:

- `assets/workspace-shell-1440.png`: split view at 1440x900; editor 52% of the pane area, PDF 48%, reload-free mode switch in the header.
- `assets/workspace-shell-700.png`: 700x800 with the sidebar drawer open; the header keeps the toggle, breadcrumb and mode switch reachable above the panes.

## Not verified here

- Real TeX output was not verified in this slice at the time of writing: the local jobs worker claimed the queued job and was terminated before the executor finished. It is now covered, together with the root-document and `\include` fixes, in `compile-parity-root-document.md`, where a fresh end-to-end compile succeeds from a single `pnpm dev` run.
- Live collaboration, presence over WSS and persistence journeys are covered by their own suites and were not rerun. Presentation fixtures are not substituted for them.
- Windows Edge project in `playwright.editor-layout.config.ts` was not run; only the Chromium project was.

## Remaining review

No deployment, merge or release approval is implied. Actual effort was not measured. Maintainers should review the shell visually and the evidence above before accepting this maintenance slice.
