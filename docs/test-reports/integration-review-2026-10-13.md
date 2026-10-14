# Origin main integration review — 2026-10-13

## Scope and merge state

- Reviewed `codex/sprint-05-assets-import-export` at `bf293c7f2e706e95941c733cb232d20293ab8236` against fetched `origin/main` at `aa8120c45ac2944388f7e91b50dbd1f66322906c` on Windows, Node 24.20.0 and pnpm 11.25.0.
- `git pull --no-rebase origin main` returned `Already up to date.` The existing merge commit `bf293c7` already has `aa8120c` as a parent. There were no new conflicts or merge edits. The branch remained five commits ahead of its upstream; no push was requested or performed.
- Inspected the S05 upload, import intake, validation, project application and storage paths; the auth rate limiter and readiness paths were traced after the browser gate failed. This is an integration review, not independent co-maintainer acceptance of S05-T10.

## Fresh verification

| Check | Result |
|---|---|
| `git diff --check origin/main...HEAD` | PASS |
| `python scripts/plan_lint.py` | PASS: 184 tasks, 93 requirements, 16 stages, 123 planned HTTP operations |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS after `pnpm install --frozen-lockfile --config.confirmModulesPurge=false` restored the local dependency graph. The first sandboxed check could not resolve workspace paths; it was not a source-code failure. |
| `pnpm test --coverage.enabled false --silent --maxWorkers 4` | PASS: 147 files, 435 tests with local PostgreSQL, Redis, MinIO and Mailpit |
| `pnpm test:integration` | PASS: 1 file, 3 tests |
| `pnpm build` | PASS; Vite reports a non-failing large-chunk warning |
| `pnpm security:check` and `node scripts/check-artifacts.mjs` | PASS; no known high-level audit findings and no secret/artifact check failures |
| Repository-wide Prettier check using the pinned binary | FAIL: 36 inherited S03/S04 and tooling files, including `apps/web/src/features/files/file-tree.tsx` (existing GAP-16) |
| `pnpm test:e2e --project=edge` with process-only local `SMTP_URL` and `EMAIL_FROM` | PASS: 9/9 Edge journeys, including signed multi-file upload |
| Full `pnpm test:e2e` with pinned Chromium/Firefox installed and the same local mail settings | FAIL: 13/27 passed. Firefox could not launch (`spawn UNKNOWN` on this Windows host); later Edge auth and project journeys failed after a preceding Redis outage test. |

The initial full E2E run without the local SMTP settings returned 503 for registration because this checkout's private `.env` has no `SMTP_URL` or `EMAIL_FROM`. The process-only settings prove the registration journey without changing the file. The second full run still failed after the Redis outage scenario, as detailed below. Coverage thresholds were not measured in this review.

## Finding — HIGH: auth remains unavailable after Redis recovery

`apps/api/src/plugins/rate-limit.ts` creates one Redis client with `reconnectStrategy: false` and keeps using it for `consume()`. `apps/api/src/readiness.ts` opens a fresh Redis client for each readiness probe. The E2E recovery test stops and restarts Redis; readiness turns healthy again, but subsequent auth requests in the same API process return 503. In the complete browser run, Chromium's earlier journeys passed, then later Firefox/Edge login and registration requests failed after the Chromium recovery test. The isolated Edge run passed all 9 journeys before any outage. The rate limiter therefore needs an explicit reconnection or client replacement path, with a regression that checks auth after Redis recovers. Until then, readiness can report healthy while account actions remain unavailable.

## Review limits and existing gaps

- Firefox launch failed with `spawn UNKNOWN` even after the pinned binary was installed. This is an execution-host/browser gate blocker; Firefox behavior was not verified.
- The full browser matrix cannot pass until the Redis recovery issue and Firefox launch problem are resolved. The local SMTP settings must also be supplied for registration E2E.
- GAP-15 production migration wiring, GAP-16 inherited formatting, GAP-17 revision-reference safety and GAP-20 S05-T10 independent review remain open. S05-T10 project application is present and its scoped tests pass, but its task status remains `IN_PROGRESS`.
- The import validation and apply passes are private one-shot commands. No continuous production scheduler or browser ZIP intake UI was verified here; those capabilities remain outside the accepted slice.

## Disposition

The requested pull required no new merge commit. Local unit, service, build and security checks passed; the integrated browser gate did not. Keep the sprint branch reviewable and resolve the Redis recovery finding before claiming a clean integration gate.
