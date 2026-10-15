---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/web/src/app/router.tsx
sources: ["docs/planning/02-architecture.md","docs/planning/03-technical-spec.md","docs/contracts/editing-and-review.md","docs/contracts/collaboration.md","apps/web/src/app/router.tsx","apps/web/src/app/providers.tsx","apps/web/src/features/health/health-panel.tsx","apps/web/src/features/auth/auth-forms.tsx","apps/web/src/features/account/profile.tsx","apps/web/src/features/account/avatar.tsx","apps/web/src/features/editor/latex-code-editor.tsx","apps/web/src/features/files/file-uploader.tsx","apps/web/src/features/projects/workspace.tsx","tests/e2e/walking-skeleton.spec.ts","tests/e2e/auth-forms.spec.ts","tests/e2e/profile.spec.ts","tests/e2e/project-upload.spec.ts","docs/test-reports/s02-t05.md","docs/test-reports/s02-t07.md","docs/test-reports/s02-t11.md","docs/test-reports/s05-t02.md","apps/web/src/features/sharing/share-dialog.tsx","tests/e2e/sharing.spec.ts","tests/regression/col-03/s08-t03.test.tsx","tests/regression/col-04/s08-t03.test.tsx","tests/regression/col-05/s08-t03.test.tsx","docs/test-reports/s08-t03.md"]
runtime: implemented
verified_on: 2026-10-15
snapshot: _meta/file-inventory.json
---

# Browser and Editing

## Summary

React/Vite shell, routes, real API readiness, accepted S02-T05 authentication forms, S02-T07 account settings and tested S02-T11 private avatar controls are implemented. The S04 code editor, S05-T02 browser upload control and S08-T03 sharing dialog exist. User-specific theme is loaded from persisted preferences on the settings page. PDF and collaborative editing remain future work.

## Why this shape

Code and visual surfaces must share canonical source and preserve unsupported LaTeX.

## Shape

The SPA uses React Router, TanStack Query, a lazy readiness panel and a browser-safe health schema. Project routes explicitly state unavailable product features. Auth routes use the real trusted-account API for invitation registration, verification, login/logout, session restoration and password recovery. Tokens are removed from URL fragments after opening. S02-T07 settings routes read/update profile preferences and list/revoke sessions through the current cookie and CSRF secret. S02-T11 loads a private avatar with credentials into a local blob preview and posts validated PNG bytes with CSRF. API errors stay visible and retry is available.

S05-T02 adds a multi-file picker and drop target to the project workspace. It runs files sequentially, computes a browser SHA-256, PUTs to a short-lived signed URL with XHR progress/cancel, and completes with a stable idempotency key. It refreshes the file tree only after the API confirms a durable node. Tests cover keyboard operation and a real Edge upload journey; co-maintainer review remains open.

S08-T03 adds the workspace sharing dialog and invitation/share-link redemption routes. The dialog reads current API member/invitation/link state, exposes owner mutations while other members see a read-only roster, and keeps errors visible with retry. Fragment tokens are cleared immediately, and the one-time link URL stays in component memory. A real Edge journey covers role change, invitation and link redemption; scoped dialog axe passes, while the inherited empty file tree has a whole-page axe finding (GAP-26).

## Connected to

Consumes HTTP, collaboration and artifact contracts. Visual editing depends on conservative source patches.

## If you change this

- **Hits:** Browser-facing contracts, S00/S04/S07–S11 task acceptance, accessibility scenarios and editor fixtures.
- **Does not hit:** Public executor isolation proof; a browser change cannot establish an isolated runtime.

## Surfaces

Browser navigation, theme, keyboard and health/outage/recovery were exercised in earlier S00 checks. S02-T05 auth routes and S02-T07 settings have local Edge end-to-end, axe and automated keyboard evidence in their scoped reports; this host currently lacks the Playwright Chromium executable.

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
- [S08-T03 sharing dialog](../../../apps/web/src/features/sharing/share-dialog.tsx)
- [S08-T03 evidence](../../test-reports/s08-t03.md)
