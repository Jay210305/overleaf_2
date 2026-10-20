# Fix: compile worker drain loop (quota stuck in `queued`)

**Branch:** `codex/fix-compile-worker-drain` | **Date:** 2026-10-20 | **Scope:** local-first, Railway runbook

## Problem

`POST /compilations` returned `429 QUOTA_EXCEEDED` ("an active job is already compiling")
for hours, across all projects of the user. Quota counts
`status IN ('queued','running','cancel_requested')` per project AND per user
(`packages/db/src/repositories/compilations.ts:162-178`), so one stuck row blocks everything.

Root causes found by inspection:

1. `apps/jobs/src/main.ts` only ran storage GC / import apply — `CompilationWorker`
   was never instantiated outside `tests/`. Queued jobs never moved. `Dockerfile`
   only starts the API.
2. `TrustedWorkerExecutor` materialized `"dummy content"` instead of frozen sources,
   and auto-created a Hello World `main.tex` — wiring it as-is would emit fake PDFs.
3. `running` rows with `lease_expires_at IS NULL` (e.g. pre-lease crash rows) were
   unclaimable: `claimNext` / `recoverStaleJobs` / `reconcileExpiredLeases` only
   matched `lease_expires_at < now`. Local zombie `a4c220b0...` (running, attempts 0,
   NULL lease, since 2026-10-18) proved it.
4. Pre-existing Windows bug: traversal guard compared `resolve()` (backslashes) with
   a forward-slash prefix, rejecting every legit item (`Path traversal rejected: main.tex`).

## Changes

- `apps/jobs/src/main.ts`: long-running loop runs `CompilationWorker.runPass()`
  every `COMPILE_POLL_MS` (default 5s, `COMPILE_LIMIT=5`, `COMPILE_LEASE_MS=5min`,
  `COMPILE_ENABLED` kill-switch) with `TrustedWorkerExecutor` + S3 storage; hourly
  storage GC preserved; `--once` runs one compile pass + GC; `imports:apply` unchanged.
- `apps/jobs/src/compilation/source-loader.ts` (new): genuine frozen bytes —
  `revision_items.text_bytes` for TEXT, object store for BINARY; missing binary fails closed.
- `apps/jobs/src/compilation/trusted-worker-executor.ts`: optional `sourceLoader`
  (real bytes when configured; legacy dummy fallback only without loader so fixtures keep working);
  with loader, missing/empty source fails the job instead of compiling substitute content;
  traversal guard uses `relative()` (Windows-safe, same security property).
- `packages/db/src/repositories/compilations.ts`: `claimNext` reclaims
  `running` with NULL or expired lease (`attempts < 3`); `recoverStaleJobs` times out
  NULL-lease `running` with `attempts >= 3`.
- `apps/jobs/src/compilation/lifecycle.ts`: `reconcileExpiredLeases` same NULL-lease handling.
- `Dockerfile.worker` (new): Railway worker image with Debian TeX Live
  (`latexmk`, pdf/Xe/LuaLaTeX, BibTeX/Biber) as `texrunner` UID 10001.
- `infra/railway/services.md`: worker service now builds `Dockerfile.worker`, env knobs,
  deploy + verify steps; closed-mode flags unchanged (`false`).
- `docs/operations/trusted-compilation.md` §4.3: replaced non-functional
  `tsx src/compilation/worker.ts --recover-stale` with the real drain commands.

## Verification (local, 2026-10-20)

- `pnpm --filter @latex-collab/jobs build` — PASS
- `pnpm typecheck` — PASS
- `pnpm vitest run tests/regression/cmp-01 tests/regression/cmp-02 tests/regression/pl-07 tests/regression/nfr-07 --coverage.enabled=false` — 33 files / 49 tests PASS
- `pnpm vitest run tests/integration/s06-t01.test.ts` — 8/8 PASS (quota, claim, heartbeat, cancel)
- `tests/integration/s06-t06,s06-t07,s06-t10,s06-t13,s06-t15,s10-t01,compiler-fixtures` — 27/27 PASS
- Live drain vs local Postgres/Redis/Minio (all healthy):
  - 1st `main.ts --once`: `Compilation pass { claimed: 5, failed: 5 }` (terminal states free quota)
  - 2nd run: `{ claimed: 1, failed: 1 }`; `queued` count → 0
  - NULL-lease `running` zombie reclaimed after fix; final: 0 rows in
    `queued/running/cancel_requested`
- `latexmk.exe` present locally; 17 pre-existing local `succeeded` rows show genuine PDFs flow.

## Not run / blocked (pre-existing, unrelated)

- `pnpm test:e2e` (Playwright browsers/services — not available in this session).
- Repo-wide `pnpm typecheck` currently fails on untracked contributor file
  `tests/integration/editor-workspace-layout.test.tsx:62-63` (`exact` is not a known
  `ByRoleOptions` property with the installed testing-library version). Pre-existing,
  untouched by this change; scoped `tsc -p` builds for `@latex-collab/db` and
  `@latex-collab/jobs` plus ESLint/Prettier on all touched files pass.
- Production Railway deploy + smoke (needs maintainer with Railway access):
  create/update `latex-collab-worker` from `Dockerfile.worker`, submit compile,
  poll to terminal, download `%PDF-`, confirm no active job older than ~10 min.
  Production stuck rows (`1e6788c7...`, `384c78d9...`) still need the documented
  `UPDATE ... SET status='cancelled'` until the worker service is live.

## Remaining gaps

- No `queued`-age timeout yet: a `queued` job with a live-but-stalled worker waits for
  the next pass. Acceptable while poll interval is 5s; add only if evidence needs it.
- `OPEN-GAPS`: record worker-service Railway deploy as pending ops task on merge.
