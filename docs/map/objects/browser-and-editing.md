---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/web/src/app/router.tsx
sources: ["docs/planning/02-architecture.md", "docs/planning/03-technical-spec.md", "docs/contracts/editing-and-review.md", "docs/contracts/collaboration.md", "apps/web/src/app/router.tsx", "apps/web/src/app/providers.tsx", "apps/web/src/features/health/health-panel.tsx", "apps/web/src/features/auth/auth-forms.tsx", "apps/web/src/features/account/profile.tsx", "apps/web/src/features/account/avatar.tsx", "apps/web/src/features/editor/latex-code-editor.tsx", "apps/web/src/features/collab/live-document.tsx", "apps/web/src/features/visual/basic-nodes.tsx", "apps/web/src/features/visual/academic-nodes.tsx", "apps/web/src/features/visual/mode-switch.tsx", "apps/web/src/features/files/file-uploader.tsx", "apps/web/src/features/projects/workspace.tsx", "tests/e2e/mixed-editing.spec.ts", "tests/e2e/walking-skeleton.spec.ts", "tests/e2e/auth-forms.spec.ts", "tests/e2e/profile.spec.ts", "tests/e2e/project-upload.spec.ts", "docs/test-reports/gate-g3-audit.md", "docs/test-reports/s11-t05.md", "docs/test-reports/s11-t09.md", "docs/test-reports/s02-t05.md", "docs/test-reports/s02-t07.md", "docs/test-reports/s02-t11.md", "docs/test-reports/s05-t02.md"]
runtime: implemented
verified_on: 2026-10-16
snapshot: _meta/file-inventory.json
---

# Browser and Editing

## Summary

React/Vite routes, authentication forms, account settings, private avatar controls, and the S05 upload control exist. The project workspace mounts a read-only Code/Visual projection for selected TEXT files and offers a live Y.Text-backed Code/Visual editor through authorized collaboration tickets. The broader G3 visual-editor acceptance remains open.

## Why this shape

Code and visual surfaces must share canonical source and preserve unsupported LaTeX.

## Shape

The SPA uses React Router, TanStack Query, a lazy readiness panel and a browser-safe health schema. Project routes explicitly state unavailable product features. Auth routes use the real trusted-account API for invitation registration, verification, login/logout, session restoration and password recovery. Tokens are removed from URL fragments after opening. S02-T07 settings routes read/update profile preferences and list/revoke sessions through the current cookie and CSRF secret. S02-T11 loads a private avatar with credentials into a local blob preview and posts validated PNG bytes with CSRF. API errors stay visible and retry is available.

S05-T02 adds a multi-file picker and drop target to the project workspace. It runs files sequentially, computes a browser SHA-256, PUTs to a short-lived signed URL with XHR progress/cancel, and completes with a stable idempotency key. It refreshes the file tree only after the API confirms a durable node. Tests cover keyboard operation and a real Edge upload journey; co-maintainer review remains open.

S11 visual components live under `features/visual/`. `ReadOnlyTextDocument` decodes the authorized Yjs snapshot and renders existing node views through the mode switch. `LiveTextDocument` obtains a scoped write or read ticket, binds CodeMirror and supported Visual patches to canonical Y.Text, and waits for a covering durable acknowledgement before showing saved. `VisualFigure` fetches real image bytes from the project-scoped READ route and shows an authorized preview only after success; failed reads stay unverified. KaTeX typesets compatible inline/display math with an unsupported-macro literal fallback; the compiled PDF remains authoritative. The [S11-T09 test](../../test-reports/s11-t09.md) drives two authenticated Edge pages through persisted convergence and conflict, and [S11-T05](../../test-reports/s11-t05.md) adds a real image preview journey. The [G3 audit](../../test-reports/gate-g3-audit.md) remains open for final quality checks and co-maintainer review.

## Connected to

Consumes HTTP, collaboration and artifact contracts. Visual editing depends on conservative source patches.

## If you change this

- **Hits:** Browser-facing contracts, S00/S04/S07–S11 task acceptance, accessibility scenarios and editor fixtures.
- **Does not hit:** Public executor isolation proof; a browser change cannot establish an isolated runtime.

## Surfaces

Browser navigation, theme, keyboard and health/outage/recovery were exercised in earlier S00 checks and the current Chromium/Edge G3 runs. S02-T05 auth routes and S02-T07 settings have local Edge end-to-end, axe and automated keyboard evidence in their scoped reports. The full browser gate remains blocked by shared login rate limiting and intermittent Firefox launch failure.

## See

- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/planning/03-technical-spec.md](../../planning/03-technical-spec.md)
- [docs/contracts/editing-and-review.md](../../contracts/editing-and-review.md)
- [docs/contracts/collaboration.md](../../contracts/collaboration.md)
- [Profile settings](../../../apps/web/src/features/account/profile.tsx)
- [S02-T07 evidence](../../test-reports/s02-t07.md)
- [Avatar control](../../../apps/web/src/features/account/avatar.tsx)
- [S02-T11 evidence](../../test-reports/s02-t11.md)
- [S05-T02 uploader](../../../apps/web/src/features/files/file-uploader.tsx)
- [S05-T02 evidence](../../test-reports/s05-t02.md)
- [Project workspace](../../../apps/web/src/features/projects/workspace.tsx)
- [Visual figure component](../../../apps/web/src/features/visual/academic-nodes.tsx)
- [Corrective G3 audit](../../test-reports/gate-g3-audit.md)
