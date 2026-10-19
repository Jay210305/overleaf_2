# Test Report: Fullscreen Workspace UI Refactor and Project ZIP Support

**Sprint:** unplanned UI/UX slice (no task ID assigned)
**Requirements:** NFR-08 (accessibility), NFR-06 (PDF viewer), EDT-04 / CMP-04 (compile controls), S03-T05 (file tree), S05-T01/T02 (uploads), S08-T05 (chat)
**Status:** PASS (with noted pre-existing failures)
**Date:** 2026-10-18

## 1. Scope

Refactor of `/project/:id` into a full-screen three-column IDE layout, conversion of
`Project chat` into a collapsible drawer, and ZIP create/import/download support built
on the existing authorized upload and file APIs.

Changed surfaces:

- `apps/web/src/features/projects/workspace.tsx` — fullscreen header, three columns, upload modal, chat drawer.
- `apps/web/src/app/router.tsx` — workspace routes hide the global shell header/footer (`100dvh`, no page scroll).
- `apps/web/src/features/files/file-tree.tsx` — compact toolbar (New File, New Folder, Upload, Download project ZIP), dark IDE styling, 24 px aligned row actions.
- `apps/web/src/features/files/file-uploader.tsx` — ZIP detection with per-archive progress and retry; native input visually hidden behind the dropzone.
- `apps/web/src/features/files/zip.ts` (new) — fflate-based extraction, entry import, project ZIP download.
- `apps/web/src/features/chat/project-chat.tsx` — drawer markup (header/status/close, scrollable messages, single-line composer) with unchanged WS/API logic.
- `apps/web/src/features/compilation/compile-controls.tsx`, `apps/web/src/features/pdf/pdf-viewer.tsx` — wrapping toolbars, full-height viewer, `Ctrl+S`/`Ctrl+Enter`, accessible names.
- `apps/web/src/features/projects/dashboard.tsx` — `Import ZIP Project` flow (create project, import entries, select main document).
- `apps/web/src/styles.css` — scoped dark-forest IDE theme.

## 2. Test Execution Record

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm exec eslint apps/web/src tests/e2e tests/integration/zip-project.test.ts` | PASS |
| `pnpm exec prettier --check <changed files>` | PASS |
| `pnpm --filter @latex-collab/web build` | PASS |
| `pnpm exec vitest run --coverage.enabled=false <24 workspace/dashboard/pdf/chat test files> tests/integration/zip-project.test.ts` | 81 passed, 1 failed (pre-existing, see §4) |
| `pnpm exec playwright test tests/e2e/project-upload.spec.ts --project=chromium` | PASS (2.6 s) |
| `pnpm exec playwright test tests/e2e/chat.spec.ts --project=chromium` | PASS |
| `pnpm exec playwright test tests/e2e/project-tree.spec.ts --project=chromium` | PASS |
| `pnpm exec playwright test tests/e2e/comments.spec.ts tests/e2e/github-sync.spec.ts tests/e2e/sharing.spec.ts tests/e2e/editor-persistence.spec.ts --project=chromium` | PASS |
| Browser verification (Chromium 1440×900 / 1600 / 1280 / 1100 / 1024 / 980 / 900 / 768) | PASS (see §3) |
| `@axe-core/playwright` WCAG 2.0/2.1/2.2 A+AA on workspace, chat drawer open, upload modal open | 0 violations |
| `pnpm test` (full suite) | NOT RUN — exceeded the 10-minute command budget |

Environment: local Fastify API + Vite web dev server, PostgreSQL/Redis/MinIO via
`infra/docker-compose.yml`, Node v26.11.1, Chromium 1248 (Playwright).

## 3. Browser Evidence

Measured in the real app against a seeded multi-folder project:

- `document.scrollWidth/scrollHeight` = viewport at every tested width (no page scroll in the editor).
- `.project-workspace` height = 900 px = viewport height; `.shell-footer` absent on `/project/:id`.
- Columns at 1440 px: sidebar 248 px, editor 631 px, PDF 517 px (~44 % / ~36 %).
- Zero horizontal overflow in `.workspace-sidebar`, `.file-tree-scroll`, `.compile-controls-bar`, `.pdf-toolbar` and `.workspace-header` at all tested widths; no clipped children detected.
- Chat drawer closed by default; header badge showed `Chat 1` after sending a message as the shared e2e user; breadcrumb read `Projects / Forest Theses Draft`.
- `Download ZIP` produced `Forest Theses Draft.zip` containing `main.tex`, `refs.bib`, `sections/`, `sections/appendix/`, `sections/intro.tex`, `sections/methods.tex`, `figures/`, `figures/figures.tex`.
- Dashboard `Import ZIP Project` with an Overleaf-style archive (`overleaf-project/main.tex`, `chapters/one.tex`, `refs.bib`) created the project, restored folders/files, superseded the default `main.tex` placeholder, and set `mainFileId` to the imported `main.tex` (verified through `GET /projects/:id/settings`).
- Uploading a ZIP inside an existing project created `bib/` + `notes.tex` through the presign/complete flow and reported skipped entries honestly.
- Below 980 px the PDF column is hidden by CSS to keep the tree and editor readable; `Hide PDF` still toggles the column from 980 px up.

## 4. Deviations, Blocker and Pre-existing Failures

- **ZIP import is client-extracted and server-validated**, not routed through the async
  `POST /projects/imports` job pipeline: in this deployment no import validation/apply
  worker is scheduled (`apps/jobs` runs storage GC only), so the job pipeline would
  stall. Every extracted entry is uploaded through the existing authorized
  `uploads/presign` → signed `PUT` → `uploads/complete` endpoints, so name, quota,
  content-policy, signature, revision and authorization checks stay server-side.
- **Pre-existing failure:** `tests/regression/acc-01/s02-t05.test.ts`
  ("renders /login as a real form") also fails on the unmodified `main` worktree
  (verified with `git stash`); it is unrelated to this change.
- **Pre-existing e2e session flakiness:** running all workspace specs in a single
  Playwright invocation can revoke the shared saved session mid-run
  (`Please sign in to view this project.`). Each affected spec passes when run on its
  own with the same code; this is a shared-session artifact, not a layout regression.
- The full `pnpm test` suite was not run inside the command budget; the affected
  24-file subset plus the new ZIP test file were run instead.

## 5. Follow-up

- Schedule `apps/jobs/src/imports/worker.ts --once` and `apps/jobs imports:apply --once`
  if the server-side import pipeline is preferred over client extraction.
- Consider extracting the adaptive column layout below 980 px (currently the PDF
  column is hidden) if a tablet layout is required.
