---
type: object
cluster: tooling
universe: live
status: verified
entity: package.json
sources: [".gitattributes", "package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "turbo.json", "tsconfig.json", "tsconfig.build.json", "scripts/check-workspace.ts", "scripts/plan_lint.py", "packages/db/package.json", "packages/storage/package.json", "packages/test-utils/package.json", "docs/progress/sprint-01.md", "docs/test-reports/s02-t01.md", "docs/test-reports/s02-t11.md"]
runtime: implemented
verified_on: 2026-10-12
snapshot: _meta/file-inventory.json
---

# Workspace Tooling

## Summary

The pnpm workspace builds the browser/API, shared contracts/config, and database, storage and test utilities packages under strict TypeScript checks. S02-T01 pins Argon2 and Nodemailer for the API.

## Why this shape

Pinned versions, local-only workspace links and a frozen lockfile make the bootstrap reproducible. ESLint and the typed guard catch missing/private package dependencies, direct server imports and unresolved dynamic browser imports.

## Shape

`pnpm-workspace.yaml` discovers `apps/*` and `packages/*` and permits Argon2's reviewed native build hook. The lockfile includes root, two apps and five shared packages. `pnpm build` compiles packages, Fastify API, browser assets and the workspace validator. Root scripts cover formatting, ESLint/boundaries, strict types, tests, real services and browser checks; consult CI for its exact matrix. `.gitattributes` forces LF checkout for text files so the pinned Prettier gate passes on Windows. The S02-T11 OpenAPI plan linter accepts binary PNG request bodies; GAP-12 generation/parity remains open.

## Connected to

Consumes Development Tooling and S00-T03/S01 evidence; browser/API/config/db/storage tasks supply source/build/startup. S00-T06 owns lint/CI rules and S00-T07 owns validated service configuration.

## If you change this

- **Hits:** Lockfile, workspace links, TypeScript/test resolution, package task graph and affected S00/S01 evidence.
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
- [docs/progress/sprint-01.md](../../progress/sprint-01.md)
- [OpenAPI plan linter](../../../scripts/plan_lint.py)
- [S02-T11 evidence](../../test-reports/s02-t11.md)
