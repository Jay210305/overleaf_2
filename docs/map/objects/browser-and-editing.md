---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/web/src/app/router.tsx
sources: ["docs/planning/02-architecture.md", "docs/planning/03-technical-spec.md", "docs/contracts/editing-and-review.md", "docs/contracts/collaboration.md", "apps/web/src/app/router.tsx", "apps/web/src/app/providers.tsx", "apps/web/src/features/health/health-panel.tsx", "apps/web/src/features/auth/auth-forms.tsx", "apps/web/src/features/account/profile.tsx", "tests/e2e/walking-skeleton.spec.ts", "tests/e2e/auth-forms.spec.ts", "tests/e2e/profile.spec.ts", "docs/test-reports/s02-t05.md", "docs/test-reports/s02-t07.md"]
runtime: implemented
verified_on: 2026-10-11
snapshot: _meta/file-inventory.json
---

# Browser and Editing

## Summary

React/Vite shell, routes, real API readiness, accepted S02-T05 authentication forms and tested S02-T07 account settings are implemented. User-specific theme is now loaded from persisted preferences on the settings page. CodeMirror, PDF and collaborative editing remain planned.

## Why this shape

Code and visual surfaces must share canonical source and preserve unsupported LaTeX.

## Shape

The SPA uses React Router, TanStack Query, a lazy readiness panel and a browser-safe health schema. Project routes explicitly state unavailable product features. Auth routes use the real trusted-account API for invitation registration, verification, login/logout, session restoration and password recovery. Tokens are removed from URL fragments after opening. S02-T07 settings routes read/update profile preferences and list/revoke sessions through the current cookie and CSRF secret. API errors stay visible and retry is available.

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
