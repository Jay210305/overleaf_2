# S12 — GitHub and versioned exports

**Status:** IN_PROGRESS | **Owner:** Julio (proposed A-02) | **Estimate:** 62 h (A-03)

**Branch:** `codex/sprint-12-github-sync`, published to `origin` with upstream; base `0555e8d` (`origin/main` after the G2 docs commit). Actual sprint effort is not measured.

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S12-T01](../../implementation/sprint-12-github-sync/S12-T01-implement-github-oauth-credential-handling.md) | DONE | Not recorded | [Report](../test-reports/s12-t01.md): 12/12 scoped, 387-file/1361-test full suite, integration 3/3, all static/security/format/artifact gates PASS; accepted by the user 2026-10-16 |
| [S12-T02](../../implementation/sprint-12-github-sync/S12-T02-link-authorized-repository-and-branch.md) | DONE | Not recorded | [Report](../test-reports/s12-t02.md): 8/8 scoped, 389-file/1369-test full suite, integration 3/3, all static/security/format/artifact gates PASS; accepted by the user 2026-10-16 |
| [S12-T03](../../implementation/sprint-12-github-sync/S12-T03-pull-using-checkpoint-and-base-sha.md) | DONE | Not recorded | [Report](../test-reports/s12-t03.md): 24/24 scoped, 392-file/1393-test full suite, integration 3/3, all static/security/format/artifact gates PASS; accepted by the user 2026-10-16 |
| [S12-T08](../../implementation/sprint-12-github-sync/S12-T08-apply-remote-changes-through-live-canonical-service.md) | DONE | Not recorded | [Report](../test-reports/s12-t08.md): immutable revision and atomic apply corrections pass focused checks and shared gates; accepted by the user 2026-10-17 |
| [S12-T04](../../implementation/sprint-12-github-sync/S12-T04-push-frozen-revision-with-remote-guard.md) | DONE | Not recorded | [Report](../test-reports/s12-t04.md): guarded frozen push and REST writer, scoped 11/11, full unit 398/1427 with 100% coverage, integration 3/3, typecheck/lint/build/format/security/artifacts/plan-lint/map PASS; accepted by the user 2026-10-17; live GitHub credentials (GAP-04) pending |
| [S12-T05](../../implementation/sprint-12-github-sync/S12-T05-create-sync-status-diff-and-resolution-ui.md) | DONE | Not recorded | [Report](../test-reports/s12-t05.md): reviewed diff/resolution UI mounted; GitHub REST reader, authorized status/sync routes, canonical apply/push and Redis invalidation wiring; full suite 410 files/1,468 tests with 100% covered-module coverage, integration 3/3, typecheck/lint/build/format/security/artifacts/plan-lint/map PASS; independent review confirmed by the user 2026-10-17 |
| [S12-T06](../../implementation/sprint-12-github-sync/S12-T06-export-authorized-revision-artifacts-and-links.md) | IN_PROGRESS | Not recorded | [Report](../test-reports/s12-t06.md): revision-bound ZIP/PDF/log and one-hour authorized read links; scoped 5/5 including PostgreSQL persistence/expiry; full suite 410 files/1,468 tests with 100% covered-module coverage, integration 3/3, typecheck/lint/build/format/security/artifacts/plan-lint/map PASS; co-maintainer review pending |
| [S12-T07](../../implementation/sprint-12-github-sync/S12-T07-verify-github-failure-concurrency-cases.md) | DONE | Not recorded | [Report](../test-reports/s12-t07.md): expired token, non-fast-forward and edit-during-sync verified against a stateful provider double and the authorized HTTP routes (scoped 17/17), then **live 4/4** against authorized repository `Jay210305/test-repo-s12t07` branch `s12-t07-live` (real push `1d845c12`, remote advance `df269889`, concurrent-edit head `94839b42`); completion instructed by the user 2026-10-17; live-only content-policy finding is GAP-38 |

## Decisions and Migrations

- S12-T01 added `apps/api/src/modules/integrations/github-auth.ts` (PKCE/state/replay/revocation, AES-256-GCM server-held tokens in `external_connections`), contract DTOs and server/main wiring with no new required env. No migration needed (table from S01-T04, `0002-support.sql`).
- S12-T02 added `apps/api/src/modules/integrations/github-link.ts` (repos listing, import-new via S03 `createProject`, pair-existing with OWNER/EDITOR check, manifest comparison, idempotent `project_integrations` record). No migration needed.
- S12-T03 added `apps/jobs/src/sync/github-pull.ts` (base-SHA and path/limit validation, immutable pre-pull checkpoint via `createStructuralRevision`, conservative/three-way classification with text/binary/tree conflicts, failure mapping) plus migration `0013-github-sync-base.sql` (`sync_base_manifest` jsonb on `project_integrations`) and the schema export. Clean pulls record the agreement; applying content through the live canonical service stays S12-T08.
- S12-T08 added `apps/jobs/src/sync/apply-changes.ts` (`createGitHubApplyService` composes the pull plan: conflict → 409 REMOTE_CONFLICT with nothing written, synced → no-op; every remote byte fetched and validated before the first mutation; text applied through the injected `CanonicalTextPort` — the real `DefaultTextDocumentService` in tests — with bounded replacement deltas; binaries content-addressed in storage; frozen-state guard against concurrent local changes; one transaction for canonical text/tree/anchors/post-pull revision/agreement; best-effort typed invalidations). Shared `detachAnchorsForChangedNodes` moved to `packages/db/src/repositories/review-anchors.ts` (restore importer updated, `restore-metadata.ts` deleted); `github-pull.ts` reads frozen revision content. Migration `0014-frozen-revision-content.sql` freezes text/metadata/manifest JSON and removes the historical node cascade.
- S12-T04 added `apps/jobs/src/sync/github-push.ts`: verifies actor, link, credential and exact frozen source/manifest; reads verified text/binary bytes; writes GitHub blobs/tree/commit from the verified remote tree and moves the ref with `force: false`; records cursor/agreement/audit only after remote success. HTTP adapter is fixture tested; live OAuth/repository evidence remains GAP-04.
- S12-T01 session-guard finding: `installProjectGuard` (`apps/api/src/plugins/require-session.ts`) only covered `/api/v1/projects/` and `/api/v1/templates`; the `/api/v1/integrations` prefix was added.

## Validation

S12-T01: scoped 12/12, full unit 387/1361 with 100% coverage, integration 3/3, typecheck/lint/build/format/security/artifacts/plan-lint/map PASS ([report](../test-reports/s12-t01.md)); accepted 2026-10-16. S12-T02: scoped 8/8, full unit 389/1369 with 100% coverage, integration 3/3, typecheck/lint/build/format/security/artifacts PASS ([report](../test-reports/s12-t02.md)); accepted 2026-10-16. S12-T03: scoped 24/24, full unit 392/1393 with 100% coverage, integration 3/3, typecheck/lint/build/format/security/artifacts/plan-lint/map PASS ([report](../test-reports/s12-t03.md)); accepted 2026-10-16. S12-T08: scoped 22/22, full unit 395/1415 with 100% coverage, integration 3/3, typecheck/lint/build/format/security/artifacts/plan-lint/map PASS ([report](../test-reports/s12-t08.md)); accepted by the user 2026-10-17. S12-T04: scoped 11/11, full unit 398/1427 with 100% coverage, integration 3/3, typecheck/lint/build/format/security/artifacts/plan-lint/map PASS ([report](../test-reports/s12-t04.md)); accepted by the user 2026-10-17. S12-T05: scoped 13/13, full unit 410/1,468 with 100% covered-module coverage, integration 3/3, typecheck/lint/build/format/security/artifacts/plan-lint/map PASS ([report](../test-reports/s12-t05.md)); accepted by the user 2026-10-17; browser gate N/A (no browser surface changed). S12-T06: scoped 5/5 including PostgreSQL persistence/expiry, shared gates PASS ([report](../test-reports/s12-t06.md)); review pending. S12-T07: scoped 17/17 against the provider double and authorized routes; **live credentialed 4/4** against `Jay210305/test-repo-s12t07` (real push/pull, non-fast-forward, invalid token, edit-during-sync), shared gates PASS ([report](../test-reports/s12-t07.md)); done 2026-10-17.

## Risks and Debt

GAP-17, GAP-33, GAP-34 and GAP-35 are closed. GAP-37 and GAP-39 are closed. GAP-04 is now partially closed: S12-T07 proved real push/pull and the three failure cases against an authorized disposable repository, while production OAuth scopes/accounts for S13 remain unverified. GAP-38 is open: applying a real repository that mixes unsupported files (e.g. `README.md`) with TeX returns 422 `UNSUPPORTED_CONTENT`. GAP-36 (flaky `col-03/s08-t03` workspace test) remains open. A post-ref-update local database failure is reported as an error and needs reconciliation work.

## 2026-10-17 continuation — delivery browser gate and cross-feature fixes

**Objective and decision:** Complete the user-requested delivery (commit, branch push, `main` merge and push) with a genuinely green browser gate. Running the full `pnpm test:e2e` surfaced a real cross-feature regression and two test-harness gaps, which were fixed instead of masking the failures.

**Product fixes:** `apps/collab/src/server.ts` now constructs its `WebSocketServer` with `noServer: true` and a root-path-only `upgrade` listener (removed on stop); previously `{ server: app.server }` claimed every API HTTP upgrade, so the project-chat socket performed a second `handleUpgrade` on the same socket and never connected (GAP-39). `apps/web/src/features/projects/workspace.tsx` renders the comment-anchor panel with the text document so anchored comments are visible in the workspace.

**Harness fixes:** `tests/e2e/comments.spec.ts` scopes the detached-range assertion to the anchor list and re-selects the file after reload; `tests/e2e/mixed-editing.spec.ts` scopes visual clicks to `live-visual-document`; `package.json` (`dev`) builds `@latex-collab/collab` before `tsx scripts/dev.ts` so local e2e runs current collab sources; new `tests/e2e/global-setup.ts` + `tests/e2e/rate-limit-flush.ts` clear the `auth:v1:*` Redis counters during the run (production limits unchanged; the limiter stays covered by S02-T06 and the intercepted-429 browser test).

**Checks (2026-10-17):** `pnpm test:e2e` PASS **52/52** (setup + chromium + firefox + edge). `pnpm test` PASS **411 files/1,472 tests**. `pnpm test:integration` PASS 3/3. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`, `pnpm security:check`, `pnpm artifacts:check`, `python scripts/plan_lint.py` (184 tasks) and `python scripts/build_icm_map.py --check` PASS. Actual effort not measured.

**Next:** S12-T06 independent co-maintainer review remains the only open S12 acceptance step; the T07 credentialed acceptance is complete. Commit, branch push, `main` fast-forward merge and `main` push are executed in this delivery step.

## 2026-10-16 continuation audit

**Objective:** inspect Sprint 12 status and continue the current T08 slice without overwriting contributor work. **Decision:** keep T08 in progress and T04–T07 pending their dependency chain; correct immutable snapshot and remaining concurrent recovery behavior before independent acceptance. No migration was changed.

**Files changed in this audit:** `apps/jobs/src/sync/apply-changes.ts`, `tests/integration/s12-t08.test.ts`, `docs/progress/open-gaps.md`, `docs/progress/sprint-12.md`, `docs/test-reports/s12-t08.md`, and the provider map card/generated inventory. Actual effort was not measured.

**Checks:** `pnpm exec vitest run tests/integration/s12-t08.test.ts tests/regression/int-05/s12-t08.test.ts tests/regression/col-12/s12-t08.test.ts --coverage.enabled=false --reporter=dot --maxWorkers=1` passed (3 files, 23 tests) with access to local PostgreSQL/MinIO after a focused red→green regression. The first sandboxed attempt failed to connect to `127.0.0.1:55432` (`EACCES`) and lost temporary Vitest files (`ENOENT`). Post-change shared gates are recorded below. The browser gate was not run for this non-UI slice.

**Post-change shared gates:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm build` exited 0; the build retained the existing Vite chunk-size warning. `pnpm test` passed 395 files/1,416 tests with 100% coverage on the covered modules (676.32 s). `pnpm test:integration` passed 1 file/3 tests. `pnpm security:check` passed secret scan and high-severity dependency audit; `pnpm artifacts:check` passed the existing artifact/migration checks. These passing gates do not resolve GAP-33/GAP-34 or constitute T08 acceptance.

**Next task (superseded by the reviewed continuation):** GAP-33/GAP-34 fixes are implemented; T04 is in progress with a guarded push service and local evidence.

## 2026-10-17 continuation — T08 acceptance and T04 full gate

**S12-T08 accepted:** The user confirmed the independent review on 2026-10-17. Task frontmatter/checkboxes, [index](../../implementation/README.md), [roadmap](../planning/04-implementation-roadmap.md), this tracker, the [T08 report](../test-reports/s12-t08.md) and [INT-05/COL-12 evidence](../feature-parity.md) now record `done`/`completed`. GAP-33/GAP-34 stay closed.

**S12-T04 slice:** `apps/jobs/src/sync/github-push.ts` is the guarded frozen-push service (role/link/credential/exact source revision/manifest/byte verification; GitHub blob/tree/commit from the verified remote base; `force: false` ref update; cursor/agreement/redacted audit only after remote success). No code change was required in this pass.

**Checks (2026-10-17):** `pnpm exec vitest run tests/integration/s12-t04.test.ts tests/regression/int-05/s12-t04.test.ts tests/regression/nfr-06/s12-t04.test.ts --coverage.enabled false` PASS 3 files/11 tests; `pnpm test` PASS 398 files/1,427 tests with 100% covered-module coverage; `pnpm test:integration` PASS 3/3; `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`, `pnpm security:check`, `pnpm artifacts:check`, `python scripts/plan_lint.py` (184 tasks) and `python scripts/build_icm_map.py --check` PASS. Browser gate N/A (no UI surface). Actual effort not measured.

**Next:** S12-T04 accepted by the user 2026-10-17; live GitHub credentialed push stays BLOCKED_BY_CREDENTIALS (GAP-04) and lands with S12-T07.

## 2026-10-17 continuation — S12-T05 implementation (review pending)

**Slice:** New `apps/web/src/features/integrations/github-sync.tsx` renders the frozen three-way sync plan (base/local/remote diff from the S12-T03 classification) and resolves every conflict explicitly as keep-local/keep-remote/manual. The exported `buildResolutionRequest` refuses non-conflict paths, unknown/force decisions and unresolved conflicts before any request; `deriveSyncUiState` never reports a pending, failed or manually deferred action as synced; `createGitHubSyncClient` uses the documented `…/status` and `…/sync` routes with local UUID/input/idempotency validation and typed error mapping. Tests: `tests/integration/s12-t05.test.ts` (real `classifyPull` plan + client contract) and `tests/regression/int-05/s12-t05.test.ts` (jsdom render).

**Checks (2026-10-17):** `pnpm exec vitest run tests/integration/s12-t05.test.ts tests/regression/int-05/s12-t05.test.ts --coverage.enabled=false` PASS 2 files/13 tests; `pnpm test` PASS 400 files/1,440 tests with 100% covered-module coverage; `pnpm test:integration` PASS 3/3; `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`, `pnpm security:check`, `pnpm artifacts:check`, `python scripts/plan_lint.py` and `python scripts/build_icm_map.py --check` PASS. Browser gate N/A (panel not mounted). Actual effort not measured.

**Limits:** The HTTP sync routes are planned/NOT_STARTED and the jobs pull/apply/push services are not worker/HTTP wired, so the client targets an unimplemented surface; the per-path `resolutions` field is a proposed extension of the planned `SyncRequest` and the panel is not yet mounted. Recorded as GAP-35. INT-05 stays IN_PROGRESS.

**Next:** independent co-maintainer review of S12-T05, then S12-T06 revision artifact exports. Commit and push remain deferred to the user.

## 2026-10-17 continuation — T05 refresh and manual-merge guards

**Objective and decision:** Continue only S12-T05. Preserve its review-pending status and GAP-35 until the authorized sync routes, worker wiring and workspace mount exist. A status refresh now discards prior conflict choices and retry key; a manual merge cannot submit an apply request.

**Files changed in this continuation:** `apps/web/src/features/integrations/github-sync.tsx`, `tests/regression/int-05/s12-t05.test.ts`, this tracker, `docs/test-reports/s12-t05.md`, and the browser map card/generated inventory. No migration or contract shape changed. Actual effort was not measured.

**Checks:** The new component regression failed for both missing guards before the fix. `pnpm exec vitest run tests/integration/s12-t05.test.ts tests/regression/int-05/s12-t05.test.ts --coverage.enabled=false` then passed (2 files/14 tests). `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm format:check` passed (the build retained its existing chunk warning). The first `pnpm test` attempt was stopped after widespread zero-test initialization failures. A focused `tests/integration/s12-t08.test.ts` run isolated the sandbox error (`connect EACCES 127.0.0.1:55432`); with local-service access the same test passed (11/11). The full `pnpm test` rerun with local-service access **failed** (399 files/1,440 tests passed; 1 file/1 test failed; 608.13 s): `tests/regression/col-03/s08-t03.test.tsx` timed out finding the workspace Share button. That test passed alone (2/2); the full gate remains failed. `pnpm test:integration` passed (1 file/3 tests). `docker compose -f infra/docker-compose.yml ps` could not interpolate local credentials because this shell lacks `.env` values. `pnpm artifacts:check`, `python scripts/plan_lint.py` and `python scripts/build_icm_map.py --check` passed. `pnpm security:check` passed its secret scan, then the npm dependency audit failed to fetch (`ENOTFOUND`); the security gate is **not PASS**. Browser E2E remains inapplicable while the panel is unmounted. The scoped safety fix does not establish T05 acceptance.

**Next:** Wire the server-side authorized sync route and conflict-resolution contract, mount the panel, then run the full applicable gates and independent co-maintainer review.

## 2026-10-17 continuation — S12-T07 failure and concurrency verification

**Objective and decision:** Implement S12-T07 by verifying the failure and concurrency requirements, not by claiming live-provider evidence that is unavailable. No authorized GitHub token or test repository exists in this checkout (GAP-04), so the credentialed half stays BLOCKED_BY_CREDENTIALS and the failure half is verified against a stateful in-memory GitHub that enforces the same non-fast-forward ref rule.

**Files changed in this continuation:** `tests/integration/github-sync.test.ts` (new), `tests/integration/s12-t07.test.ts` (new), `tests/regression/int-05/s12-t07.test.ts` (new), `docs/test-reports/s12-t07.md` (new), `apps/jobs/src/sync/github-pull.ts` (provider-error map preserves QUOTA_EXCEEDED/413), and the S12-T07 task frontmatter, this tracker, [feature evidence](../feature-parity.md), [open gaps](open-gaps.md), the task index and the generated map inventory. No migration or contract shape changed. Actual effort was not measured.

**Checks:** The scoped gate `pnpm exec vitest run tests/integration/github-sync.test.ts tests/integration/s12-t07.test.ts tests/regression/int-05/s12-t07.test.ts --coverage.enabled=false` passed (3 files/17 tests) with local PostgreSQL. A re-run of the S12-T02/T03/T04/T05/T06/T08 suites plus the int-05/col-12/nfr-06/pro-06/int-10 regressions passed (27 files/112 tests) after the provider-mapping change. `pnpm test` passed (410 files/1,468 tests, 100% covered-module coverage; 470.33 s). `pnpm test:integration` passed (1 file/3 tests). `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`, `pnpm security:check` (secret scan + high-severity audit, no findings), `pnpm artifacts:check`, `python scripts/plan_lint.py` (184 tasks) and `python scripts/build_icm_map.py --check` all passed. Browser E2E is not applicable (no browser surface changed). One combined S12 run transiently failed the `s12-t05-mount` jsdom test; it passed alone and in the full 1,468-test gate, so the earlier flake is not attributed to this change.

**Next:** Independent co-maintainer review of S12-T07. Live credentialed push/pull remains GAP-04 and requires an authorized test repository; the cross-system reconciliation after a post-ref-update database failure is still open.

## 2026-10-17 continuation — S12-T07 credentialed live acceptance

**Objective and decision:** The user supplied an authorized disposable repository and a Contents-read/write credential, so the live half was executed for real instead of accepting the provider-double substitute. The credential lives only in the gitignored `.env.github-test`; it is not in Git, logs or this tracker.

**Live harness:** `tests/integration/s12-t07-live.test.ts` uses the production `createGitHubRestReader`/`createGitHubRestPushWriter` and the real pull/apply/push services against `Jay210305/test-repo-s12t07` branch `s12-t07-live`. It is skipped unless `GITHUB_LIVE_TOKEN`, `GITHUB_LIVE_REPO` and a non-default `GITHUB_LIVE_BRANCH` are present, so CI stays offline.

**Result:** PASS 4/4. Real push produced commit `1d845c12`; a remote advance produced `df269889` and pulled back into canonical text; a stale expected SHA returned 409 `REMOTE_CONFLICT` with the real ref and cursor unchanged; an invalid credential returned 401 `TOKEN_EXPIRED` without touching the ref; a local edit during real byte fetch returned 409 `REVISION_CONFLICT`, kept the concurrent text, wrote no post-pull revision and left the ref at `94839b42`.

**Live-only finding:** the first attempt failed with 422 `UNSUPPORTED_CONTENT` because the repository contained `README.md`. The scratch branch was reduced to TeX files so the concurrency assertions could run; arbitrary-repository sync remains open as GAP-38.

**Documentation:** S12-T07 task frontmatter/checkboxes, [index](../../implementation/README.md), [roadmap](../planning/04-implementation-roadmap.md), this tracker, the [T07 report](../test-reports/s12-t07.md), [feature evidence](../feature-parity.md), [open gaps](open-gaps.md) and the generated map inventory are synchronized. Actual effort was not measured.

**Next:** S12-T06 independent co-maintainer review remains the only open S12 acceptance step. Commit, branch push, main merge and main push are requested by the user and handled in the delivery step.

## Next Task

S12-T01, S12-T02, S12-T03, S12-T08, S12-T04, S12-T05 and S12-T07 are DONE (user review accepted/confirmed 2026-10-16/2026-10-17). S12-T07 now includes live credentialed push/pull and failure/concurrency evidence against `Jay210305/test-repo-s12t07`. S12-T06 is implemented and review-pending (scoped 5/5 including PostgreSQL persistence/expiry). Next: independent co-maintainer review of S12-T06, then the sprint acceptance. GAP-38 (unsupported files block apply) and GAP-36 (flaky `col-03/s08-t03`) remain open. Commit and push are handled in the user-requested delivery step.
