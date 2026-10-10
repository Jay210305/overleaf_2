---
type: object
cluster: runtime-design
universe: ghost
status: stub
entity: apps/web
sources: ["docs/planning/02-architecture.md","docs/planning/03-technical-spec.md","docs/contracts/editing-and-review.md","docs/contracts/collaboration.md"]
runtime: proposed
---

# Browser and Editing

## Summary

The proposed React/Vite browser hosts code editing, PDF preview and later collaborative/visual editing.

## Why this shape

Code and visual surfaces must share canonical source and preserve unsupported LaTeX.

## Shape

Proposed paths: `apps/web`, `packages/editor`, `packages/latex`. React, CodeMirror, Yjs and PDF.js choices are design references, not inspected installed modules.

## Connected to

Consumes HTTP, collaboration and artifact contracts. Visual editing depends on conservative source patches.

## If you change this

- **Hits:** Browser-facing contracts, S00/S04/S07–S11 task acceptance, accessibility scenarios and editor fixtures.
- **Does not hit:** Public executor isolation proof; a browser change cannot establish an isolated runtime.

## Surfaces

Currently maintainers/agents read design files. Future browser code paths have no runtime surface yet.

## See

- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/planning/03-technical-spec.md](../../planning/03-technical-spec.md)
- [docs/contracts/editing-and-review.md](../../contracts/editing-and-review.md)
- [docs/contracts/collaboration.md](../../contracts/collaboration.md)
