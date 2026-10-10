---
type: object
cluster: runtime-design
universe: ghost
status: stub
entity: apps/git-bridge
sources: ["docs/contracts/integrations.md","docs/planning/02-architecture.md","docs/progress/open-gaps.md","docs/planning/04-implementation-roadmap.md"]
runtime: proposed
---

# Provider and Git Adapters

## Summary

Optional provider and Git adapters are planned for explicit imports, exports and manual synchronization checkpoints.

## Why this shape

Remote synchronization must verify capabilities and expected remote versions without overwriting concurrent work.

## Shape

Proposed paths: `apps/jobs/src/sync`, `apps/git-bridge`; provider/API choices and credentials remain research gaps. G4 is optional.

## Connected to

Consumes immutable revisions and server-held credentials; references browser/API checkpoint contracts.

## If you change this

- **Hits:** Integration contract, S12–S14 tasks, remote conflict scenarios and capability/credential gap records.
- **Does not hit:** Core trusted editor release when optional integration work remains outside G1 scope.

## Surfaces

Maintainers research design sources; no live provider session or adapter implementation is asserted.

## See

- [docs/contracts/integrations.md](../../contracts/integrations.md)
- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/progress/open-gaps.md](../../progress/open-gaps.md)
- [docs/planning/04-implementation-roadmap.md](../../planning/04-implementation-roadmap.md)
