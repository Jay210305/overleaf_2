---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/web/src/app/router.tsx
sources: ["docs/planning/02-architecture.md", "docs/planning/03-technical-spec.md", "docs/contracts/editing-and-review.md", "docs/contracts/collaboration.md", "apps/web/src/app/router.tsx", "apps/web/src/app/providers.tsx", "apps/web/src/features/health/health-panel.tsx", "tests/e2e/walking-skeleton.spec.ts"]
runtime: implemented
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Browser and Editing

## Summary

React/Vite shell, routes, persisted local theme and real API readiness are implemented. CodeMirror, PDF and collaborative editing remain planned.

## Why this shape

Code and visual surfaces must share canonical source and preserve unsupported LaTeX.

## Shape

The SPA uses React Router, TanStack Query, a lazy readiness panel and a browser-safe health schema. Project/settings routes explicitly state unavailable product features. API errors stay visible and manual retry is available.

## Connected to

Consumes HTTP, collaboration and artifact contracts. Visual editing depends on conservative source patches.

## If you change this

- **Hits:** Browser-facing contracts, S00/S04/S07–S11 task acceptance, accessibility scenarios and editor fixtures.
- **Does not hit:** Public executor isolation proof; a browser change cannot establish an isolated runtime.

## Surfaces

Browser navigation, theme, keyboard and health/outage/recovery are exercised in Chromium, Firefox and Edge.

## See

- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/planning/03-technical-spec.md](../../planning/03-technical-spec.md)
- [docs/contracts/editing-and-review.md](../../contracts/editing-and-review.md)
- [docs/contracts/collaboration.md](../../contracts/collaboration.md)
