# Main integration review — S13 and S14

**Date:** 2026-10-17. **Target:** `main`. **Starting base:** `3879f72` (the current Sprint 12 main). **Sources:** `origin/codex/sprint-13-reference-providers` at `23447a5`, then its descendant `origin/codex/sprint-14-git-and-optional-features` at `13477df`. The first local merge commit is `e4de8b0`; the second merge is recorded by Git history after this report is committed.

## Integration decisions

- Kept the Sprint 12 GitHub sync route wiring, contracts, status and evidence while incorporating the Sprint 13 provider work and Sprint 14 optional features. Resolved conflicts in `apps/api/src/server.ts`, `package.json`, `packages/contracts/src/index.ts`, the task index, feature parity, progress log and generated map inventory.
- Removed the Sprint 13 hardcoded credential encryption fallback. New local environments receive a random `INTEGRATION_CREDENTIAL_KEY` from `pnpm env:init`; existing deployments must configure that key or `SESSION_SECRET` before enabling encrypted provider credentials or MFA.
- Disabled OAuth start and callback in production when no trusted provider profile resolver is configured. The S14 branch resolver fabricated a provider identity from any supplied code, which could authenticate as an existing account. Test fixtures explicitly inject a mock resolver; the real API process does not. OAuth remains unavailable until a real provider exchange and verified profile resolver are wired and reviewed.
- Made the Git CLI integration deterministic on Windows by disabling CRLF conversion for its temporary repository. The browser sharing test now waits for the member removal reload before filling the invitation form.
- Repaired the pre-existing clean-checkout CI artifact gate: `scripts/check-artifacts.mjs` expected `apps/jobs/dist/imports/apply.js`, while the source and build produce `apply-project.js`. The previous `main` [GitHub Actions push run](https://github.com/Jay210305/overleaf_2/actions/runs/39078438698) passed install, build, formatting, lint, typecheck, tests and security, then failed at that stale artifact path before reaching planning, integration or browser checks.

## Local verification

The merged tree was checked on Windows with Node 24.20.0 and pnpm 11.25.0, using the repository's local PostgreSQL, Redis, MinIO and browser services.

| Command | Observed result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS; lockfile install and supply-chain policy checks completed. |
| `pnpm build` | PASS, including API, jobs, web and Git bridge. |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | PASS on the corrected tree. |
| `pnpm test` | PASS: 462 files, 1,690 tests; configured coverage reports 100% for its four included files. |
| `pnpm security:check` | PASS: secret scan and high-severity dependency audit. |
| `pnpm artifacts:check` | PASS after correcting the stale import-apply artifact path. |
| `python scripts/plan_lint.py` | PASS: 184 tasks, 93 requirements, 16 stages. |
| `pnpm test:integration` | PASS: 1 file, 3 tests. |
| `pnpm test:e2e` | PASS: 52 browser tests across Chromium, Firefox and Edge after fixing the sharing test reload race. |
| `python scripts/build_icm_map.py --check` | PASS: 13 objects and 2 documented processes; generated inventory current. |

The first post-merge browser run failed 1 of 52 tests at the sharing dialog reload; a focused three-repeat Chromium run then passed 4/4 including setup, and the complete rerun passed 52/52. The first post-OAuth full test run had one TypeScript smoke failure from the new test fixture; after correcting its exact-optional-property typing and required readiness option, the focused rerun passed 10/10 and the clean full rerun passed 1,690/1,690. A passing local check does not establish credentialed provider staging acceptance.

## Release boundary

G4 remains **pending**. The source branch's G4 report claimed release sign-off, but this merge review found no credentialed staging evidence for the full supported provider set. The Zotero workspace panel is defined but not mounted; Dropbox sync and the remote resource helper are not wired into the running application; the Git bridge lacks deployment configuration; and production OAuth has no trusted provider exchange and verified profile resolver. These components remain partial or unavailable until they are connected and independently verified. Mendeley and Papers remain blocked by provider access. See [GAP-40](../progress/open-gaps.md).

The merge preserves the branch task reports as scoped implementation evidence. It does not create an independent co-maintainer review or authorize a G4 release.
