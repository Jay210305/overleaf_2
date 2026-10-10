# S00 continuation verification

**Date:** 2026-10-10. **Branch:** feature/sprint-00. **Base:** 721c30c.
**Environment:** CachyOS Linux amd64, Node 24.21.0, pnpm 11.25.0, Docker 29.8.2.
**Actual effort:** not measured. Estimates are not substituted for time worked.
**Review status:** the Project Co-owner explicitly chose to review before closure on 2026-10-10; independent acceptance is pending. Do not mark the eight new tasks done.

## Delivered scope

React/Vite routing, providers, theme, explicit unavailable product views; Fastify
health and Problem Details; browser-safe shared DTO/config and private server config;
ESLint and browser/server boundary guard; strict TypeScript; deterministic tests
with critical coverage; digest-pinned PostgreSQL/Redis/Mailpit and source-pinned
MinIO; generated local credentials, private bucket startup; real readiness,
retries and visible outages; GitHub Actions; ADRs, traceability and clean setup.
No S01 schema/auth/editor/TeX or provider feature was implemented.

## Acceptance review

| Check | Observed outcome |
|---|---|
| Frozen installation | PASS with pnpm 11.25.0; esbuild postinstall is explicitly allowed; other package hooks remain denied. |
| Formatting, lint, types | PASS locally. Bootstrap guard expanded to absolute/unknown/private and computed browser imports. |
| Unit/component/API/regression | PASS: 31 tests in 8 files. |
| Critical coverage | PASS: 100% lines, branches, functions and statements on API health/errors and public/private config; this is four modules, not whole-product coverage. |
| Build | PASS: both apps, both shared packages and typed workspace tool. API emits Node modules; browser emits Vite assets. |
| Dependency and secret scan | PASS: no known high/critical findings and no generated local credential values in source/builds. |
| Real services | PASS: PostgreSQL SELECT, Redis PING, authenticated HeadBucket, Mailpit live endpoint; unavailable Redis makes readiness false. Anonymous bucket read returns 403. |
| Browser scope | PASS: 9 E2E assertions across Chromium 156, Firefox 157 and user-local Microsoft Edge 155.0.4283.45. Includes keyboard, persisted theme, direct-route reload, axe serious/critical=0, network retry, actual Redis stop/restart, live=200 while ready=503. |
| Clean start | PASS: a fresh source-only copy with no node_modules/dist/.env completed frozen install, env:init, infra:up with a new Compose project and empty volumes, 3 real-service tests, app builds/artifacts and all 9 three-browser E2E cases. No private env was copied. |
| GitHub CI | PASS on final code commit b302e75: [run 38078320246](https://github.com/Jay210305/overleaf_2/actions/runs/38078320246), every step succeeded, including real integration and all 9 browser cases. Initial run 38077896320 also passed on 388404c. |
| Documentation/map | PASS: plan_lint and ICM build/check validate synchronized references, task status, source hashes and actual runtime cards. |
| Co-maintainer review | PENDING: AGENTS.md and each task require independent human acceptance before done. |

## Failure and recovery record

- Initial T05 fixture failed because the API module did not exist, then passed after implementation.
- pnpm first rejected unapproved esbuild hooks; allowBuilds now approves only esbuild.
- Public config initially rejected Vite's own VITE_USER_NODE_ENV; it is now allowed as tooling metadata but not returned as application config. Secret-bearing VITE variables remain denied.
- Initial root test imports could not resolve workspace/React packages. Explicit root dev dependencies and source aliases resolved test execution/coverage without weakening thresholds.
- S00-T03's nested compiler check exceeded its old 5-second timeout while MinIO was building; deterministic tests now use a bounded 30-second timeout and two workers.
- Docker Hub MinIO, Quay and old binary URL were unavailable. Official source build succeeded, with pinned revision, digest-pinned base images, non-root runtime and retained license.
- Edge system installation requested unavailable sudo authentication. A verified official Microsoft package was extracted under /tmp and its executable was used, without changing system packages. CI uses standard supported Ubuntu installation.
- Clean-copy startup exposed a missing shared-package build before bucket initialization; infra:up now builds its required packages itself and rebuilds the pinned image before boot. The failed first clean attempt is retained in the verification record.
- A browser bundle warning remains near 500 kB; the readiness panel is lazy-loaded. This is a recorded optimization item, not a failed acceptance gate.

## Commands

`pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, `pnpm security:check`, `pnpm artifacts:check`,
`pnpm infra:up`, `pnpm test:integration`, `pnpm test:e2e`, and documentation checks.
Local commands used a PATH selecting the pinned Node 24 binary and pnpm script;
the host default Node 26 was not used for acceptance. Edge used EDGE_EXECUTABLE_PATH.

## Remaining boundary

The eight new task statuses remain in_progress until independent co-maintainer
review. Later feature IDs stay NOT_STARTED/IN_PROGRESS according to their own
scope; no public signup or untrusted compilation is enabled.

## Publication and review surface

Implementation is pushed to feature/sprint-00. The GitHub connector returned 403 Resource not accessible by integration when creating a draft PR; git credential API fallback was unavailable. No PR was created or merged. The published branch and this report are the review surface.

S00 technical checks are complete; formal task closure still requires the independent co-maintainer review specified by AGENTS.md.

## Final local launcher verification

Direct Node child processes passed the full 9-case browser suite after the launcher change. Live browser process environment was inspected for service/session keys: none inherited. Local browser/API smoke passed; home and dark project view had zero serious/critical axe findings. The preview remains running for review. Only documentation changes follow b302e75; source-plan hashes and map checks are validated locally.
