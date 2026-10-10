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

Pinned versions, local-only workspace links and a frozen lockfile make the bootstrap reproducible. ESLint and the typed guard catch missing/private package dependencies, direct server imports and unresolved dynamic browser imports.

## Shape

`pnpm-workspace.yaml` discovers `apps/*` and `packages/*`. The lockfile currently has five importers including root. `pnpm build` compiles shared packages, the Fastify API, browser assets and the workspace validator. The root scripts run formatting, ESLint/boundaries, strict types, coverage, real services and browser tests. CI uses the same scripts.

## Connected to

Consumes Development Tooling and S00-T03; implemented browser/API/config tasks supply source/build/startup. S00-T06 owns full lint/CI rules and S00-T07 owns validated service configuration.

## If you change this

- **Hits:** Lockfile, workspace links, TypeScript/test resolution, package task graph, S00-T03 evidence and later S00 tooling tasks.
- **Does not hit:** Later project authorization, CRDT durability or compiler isolation proof.

## Surfaces

Maintainers run frozen install, task tests, ESLint/boundary checks, typecheck and app/package builds. Package manifests expose browser-safe contracts/config and a server-only config subpath. `pnpm dev` starts browser/API after compiling shared packages.

## See

- [package.json](../../../package.json)
- [pnpm-workspace.yaml](../../../pnpm-workspace.yaml)
- [pnpm-lock.yaml](../../../pnpm-lock.yaml)
- [turbo.json](../../../turbo.json)
- [tsconfig.json](../../../tsconfig.json)
- [scripts/check-workspace.ts](../../../scripts/check-workspace.ts)
- [docs/test-reports/s00-t03.md](../../test-reports/s00-t03.md)
