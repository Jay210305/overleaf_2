---
type: object
cluster: tooling
universe: live
status: verified
entity: package.json
sources: ["package.json","pnpm-workspace.yaml","pnpm-lock.yaml","turbo.json","tsconfig.json","tsconfig.build.json","scripts/check-workspace.ts","tests/integration/s00-t03.test.ts","tests/regression/pl-01/s00-t03.test.ts","docs/test-reports/s00-t03.md"]
runtime: implemented
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Workspace Tooling

## Summary

The live pnpm workspace links the initial browser/API manifests to shared contracts/config manifests. A strict TypeScript configuration covers source as it is added.

## Why this shape

Pinned versions, local-only workspace links and a frozen lockfile make the bootstrap reproducible. A small typed guard catches missing or private package dependencies and direct private browser source imports before full lint arrives.

## Shape

`pnpm-workspace.yaml` discovers `apps/*` and `packages/*`. The lockfile currently has five importers including root. `pnpm build` compiles `scripts/check-workspace.ts`; it does not build app bundles. Turbo parses the future package task graph, but its package-level build commands are not defined yet.

## Connected to

Consumes Development Tooling and S00-T03; future browser/API/config tasks add source/build/startup. S00-T06 owns full lint/CI rules and S00-T07 owns validated service configuration.

## If you change this

- **Hits:** Lockfile, workspace links, TypeScript/test resolution, package task graph, S00-T03 evidence and later S00 tooling tasks.
- **Does not hit:** Browser/API runtime behavior, Docker service readiness, authorization or compiler isolation.

## Surfaces

Maintainers run frozen install, task tests, bootstrap lint, typecheck and tooling build. Package manifests have no runtime entry points yet.

## See

- [package.json](../../../package.json)
- [pnpm-workspace.yaml](../../../pnpm-workspace.yaml)
- [pnpm-lock.yaml](../../../pnpm-lock.yaml)
- [turbo.json](../../../turbo.json)
- [tsconfig.json](../../../tsconfig.json)
- [scripts/check-workspace.ts](../../../scripts/check-workspace.ts)
- [docs/test-reports/s00-t03.md](../../test-reports/s00-t03.md)
