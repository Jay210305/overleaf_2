# S14 — Git HTTP optional features and G4 release

**Status:** DONE | **Owner:** Julio (proposed A-02) | **Estimate:** 90 h (A-03) | **Actual:** 90 h

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S14-T01](../../implementation/sprint-14-git-and-optional-features/S14-T01-research-git-http-implementation-and-mapping.md) | DONE | 4 h | [Test report](../test-reports/s14-t01.md), [ADR-010](../adr/010-git-http.md) |
| [S14-T02](../../implementation/sprint-14-git-and-optional-features/S14-T02-create-authenticated-git-bridge-service.md) | DONE | 8 h | [Test report](../test-reports/s14-t02.md), `tests/integration/s14-t02.test.ts`, `tests/regression/int-06/s14-t02.test.ts`, `tests/regression/acc-02/s14-t02.test.ts` |
| [S14-T03](../../implementation/sprint-14-git-and-optional-features/S14-T03-implement-actual-clone-fetch-and-push.md) | DONE | 8 h | [Test report](../test-reports/s14-t03.md), `tests/integration/s14-t03.test.ts`, `tests/regression/int-06/s14-t03.test.ts` |
| [S14-T04](../../implementation/sprint-14-git-and-optional-features/S14-T04-apply-git-imports-through-canonical-mutation-service.md) | DONE | 8 h | [Test report](../test-reports/s14-t04.md), `tests/integration/s14-t04.test.ts`, `tests/regression/int-06/s14-t04.test.ts`, `tests/regression/col-12/s14-t04.test.ts` |
| [S14-T05](../../implementation/sprint-14-git-and-optional-features/S14-T05-deliver-preference-controlled-email-notifications.md) | DONE | 8 h | [Test report](../test-reports/s14-t05.md), `tests/integration/s14-t05.test.ts`, `tests/regression/acc-08/s14-t05.test.ts`, `tests/regression/col-13/s14-t05.test.ts` |
| [S14-T06](../../implementation/sprint-14-git-and-optional-features/S14-T06-add-optional-private-writing-assistance.md) | DONE | 8 h | [Test report](../test-reports/s14-t06.md), `tests/integration/s14-t06.test.ts`, `tests/regression/int-09/s14-t06.test.ts`, `tests/regression/edt-14/s14-t06.test.ts` |
| [S14-T07](../../implementation/sprint-14-git-and-optional-features/S14-T07-implement-safe-social-oauth-account-linking.md) | DONE | 8 h | [Test report](../test-reports/s14-t07.md), `tests/integration/s14-t07.test.ts`, `tests/regression/acc-04/s14-t07.test.ts`, `tests/regression/acc-06/s14-t07.test.ts` |
| [S14-T09](../../implementation/sprint-14-git-and-optional-features/S14-T09-profile-additional-compiler-packages-and-fonts.md) | DONE | 6 h | [Test report](../test-reports/s14-t09.md), `tests/integration/s14-t09.test.ts`, `tests/integration/special-packages.test.ts`, `tests/regression/cmp-12/s14-t09.test.ts`, `tests/regression/pl-07/s14-t09.test.ts` |
| [S14-T10](../../implementation/sprint-14-git-and-optional-features/S14-T10-implement-ssrf-safe-permitted-remote-resource-import.md) | DONE | 8 h | [Test report](../test-reports/s14-t10.md), `tests/integration/s14-t10.test.ts`, `tests/regression/pro-14/s14-t10.test.ts`, `tests/regression/pl-07/s14-t10.test.ts` |
| [S14-T11](../../implementation/sprint-14-git-and-optional-features/S14-T11-implement-optional-totp-challenge-and-recovery-slice.md) | DONE | 8 h | [Test report](../test-reports/s14-t11.md), `tests/integration/s14-t11.test.ts`, `tests/regression/acc-06/s14-t11.test.ts`, `tests/regression/acc-04/s14-t11.test.ts` |
| [S14-T08](../../implementation/sprint-14-git-and-optional-features/S14-T08-verify-real-git-protocol-and-token-revocation.md) | DONE | 8 h | [Test report](../test-reports/s14-t08.md), `tests/integration/git-cli.test.ts`, `tests/integration/s14-t08.test.ts`, `tests/regression/int-06/s14-t08.test.ts` |
| [S14-T12](../../implementation/sprint-14-git-and-optional-features/S14-T12-stabilize-and-review-supported-g4-integrations.md) | DONE | 8 h | [Test report](../test-reports/s14-t12.md), [Gate G4 audit report](../test-reports/gate-g4-audit.md) |

## Decisions and Migrations

- Created `apps/git-bridge`: Fastify Smart HTTP Git service supporting clone/fetch/push over HTTP.
- Designed ADR-010: Personal Access Tokens hashed with SHA-256 in DB, separate `git:read`/`git:write` scopes, instant revocation, zero session cookies in Git responses.
- Implemented `apps/git-bridge/src/protocol.ts`: Pure TS Git object & packfile builder with packet-line framing, sideband streaming, and non-fast-forward push rejection.
- Implemented `apps/git-bridge/src/import.ts`: Translates Git tree/text updates into canonical Yjs document mutations, creates project revisions, and reports detached comment anchors.
- Implemented `apps/jobs/src/notifications/email.ts` and `apps/web/src/features/notifications/preferences.tsx`: Preference-controlled notification emails for mentions/invites/replies with Mailpit and idempotency deduplication.
- Implemented `packages/contracts/src/writing-assistant.ts` and `apps/api/src/modules/assistance/routes.ts`: Private writing assistance with mandatory user opt-in consent, fragment-only transmission (<=4000 chars), quota limits, and non-blocking fallback to static LaTeX help.
- Implemented `apps/api/src/modules/auth/oauth.ts`: Safe social OAuth linking and unlinking with PKCE, state validation, and identity hijacking protection.
- Implemented `apps/api/src/modules/auth/mfa.ts` and `totp.ts`: RFC 6238 TOTP two-factor authentication, QR/base32 secret generation, encrypted storage, single-use recovery codes, and challenge-based disable with session revocation.
- Implemented `apps/jobs/src/imports/remote-resource.ts`: SSRF-safe remote resource imports with private IP rejection, cloud metadata IP protection, DNS revalidation, and size/time boundaries.
- Created `apps/tex-executor/package-manifest.json`: Verified TeX Live package catalog, open-source licenses, and engine compatibility matrix.
- Recorded the branch Gate 4 audit in `docs/test-reports/gate-g4-audit.md`; merged-main release verification remains pending in `docs/test-reports/merge-s13-s14.md`.

## Validation

- S14-T01: Research completed; ADR-010 published; plan_lint PASS.
- S14-T02: `pnpm exec vitest run tests/integration/s14-t02.test.ts tests/regression/int-06/s14-t02.test.ts tests/regression/acc-02/s14-t02.test.ts` PASS (19 tests).
- S14-T03: `pnpm exec vitest run tests/integration/s14-t03.test.ts tests/regression/int-06/s14-t03.test.ts` PASS (8 tests).
- S14-T04: `pnpm exec vitest run tests/integration/s14-t04.test.ts tests/regression/int-06/s14-t04.test.ts tests/regression/col-12/s14-t04.test.ts` PASS (5 tests).
- S14-T05: `pnpm exec vitest run tests/integration/s14-t05.test.ts tests/regression/acc-08/s14-t05.test.ts tests/regression/col-13/s14-t05.test.ts` PASS (9 tests).
- S14-T06: `pnpm exec vitest run tests/integration/s14-t06.test.ts tests/regression/int-09/s14-t06.test.ts tests/regression/edt-14/s14-t06.test.ts` PASS (8 tests).
- S14-T07: `pnpm exec vitest run tests/integration/s14-t07.test.ts tests/regression/acc-04/s14-t07.test.ts tests/regression/acc-06/s14-t07.test.ts` PASS (11 tests).
- S14-T09: `pnpm exec vitest run tests/integration/s14-t09.test.ts tests/integration/special-packages.test.ts tests/regression/cmp-12/s14-t09.test.ts tests/regression/pl-07/s14-t09.test.ts` PASS (11 tests).
- S14-T10: `pnpm exec vitest run tests/integration/s14-t10.test.ts tests/regression/pro-14/s14-t10.test.ts tests/regression/pl-07/s14-t10.test.ts` PASS (12 tests).
- S14-T11: `pnpm exec vitest run tests/integration/s14-t11.test.ts tests/regression/acc-06/s14-t11.test.ts tests/regression/acc-04/s14-t11.test.ts` PASS (5 tests).
- S14-T08: `pnpm exec vitest run tests/integration/git-cli.test.ts tests/integration/s14-t08.test.ts tests/regression/int-06/s14-t08.test.ts` PASS (13 tests).
- S14-T12: Branch-scoped audit recorded. Merged-main quality checks are in `docs/test-reports/merge-s13-s14.md`; credentialed staging and independent Gate 4 release approval remain pending.

## Next Sprint

Sprint 15 (`sprint-15-public-hardening`): Public hardening, trusted executor isolation, rate limiting, and Gate 5 sign-off.
