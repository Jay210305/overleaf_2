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

The live GitHub slice has encrypted OAuth credentials, a linked repo/branch, checkpoint pull planning, canonical Yjs apply, guarded frozen push, a fixed-host REST reader/writer, authorized HTTP status/sync routes and a mounted workspace diff/resolution panel. `POST .../status` writes the immutable checkpoint; sync uses explicit conflict decisions and persisted idempotency claims. Redis publishes canonical room updates and file deletions across replicas after commit. `apps/git-bridge` remains proposed. Remote reads/writes have fixture coverage but no authorized live GitHub session (GAP-04).

## Connected to

Consumes immutable revisions and server-held credentials; references browser/API checkpoint contracts.

## If you change this

- **Hits:** Integration contract, S12–S14 tasks, remote conflict scenarios and capability/credential gap records.
- **Does not hit:** Core trusted editor release when optional integration work remains outside G1 scope.

## Surfaces

The S12 surfaces include `apps/api/src/modules/integrations/{github-auth,github-link,github-rest,github-sync}.ts`, `apps/jobs/src/sync/{github-pull,apply-changes,github-push}.ts`, `apps/web/src/features/integrations/github-sync.tsx`, `external_connections`/`project_integrations`/`github_sync_requests`, and migrations `0013`–`0015`. Anchor detachment is shared with history restore through `packages/db/src/repositories/review-anchors.ts`.

## See

- [docs/contracts/integrations.md](../../contracts/integrations.md)
- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/progress/open-gaps.md](../../progress/open-gaps.md)
- [docs/planning/04-implementation-roadmap.md](../../planning/04-implementation-roadmap.md)
- [S12-T01 evidence](../../test-reports/s12-t01.md)
- [S12-T02 evidence](../../test-reports/s12-t02.md)
- [S12-T03 evidence](../../test-reports/s12-t03.md)
- [S12-T08 evidence](../../test-reports/s12-t08.md)
- [S12-T04 evidence](../../test-reports/s12-t04.md)
- [S12-T05 evidence](../../test-reports/s12-t05.md)
