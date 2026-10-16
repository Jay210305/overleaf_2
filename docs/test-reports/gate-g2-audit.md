# Gate G2 Audit — Durable collaboration, sharing, comments and chat

**Status:** Audit complete, verdict PASS with carried debt (no release cut); co-maintainer review of this audit pending before S08-T10 closes. **Evidence head:** `14b4a06` (`main`: S08 sharing/chat merged plus S11/G3). S08 product code is unchanged since the G2 head `7ee0db8` except the reviewed formatting commit `02e6772`; the current-head green runs below therefore cover the G2 scope. Uncommitted changes in this checkout are planning/report text only. **Environment:** Windows, Node 24.20.0, pnpm 11.25.0, local PostgreSQL/Redis/MinIO/Mailpit. **Actual effort:** Not measured.

## Declared gate scope (S06 → S07 → S08)

G2 covers trusted-compilation handoff (S06, already G1-audited), durable real-time collaboration (S07) and sharing/comments/chat (S08). Release checklists items about public signup, hosted deployment, backup rehearsal and versioning are out of scope: no release is cut here and public signup plus untrusted compilation stay disabled.

## Review checklist and verdicts

| # | Criterion | Evidence | Verdict |
|---|---|---|---|
| 1 | NFR-02: five simultaneous editors converge on identical content | [S07-T10](../test-reports/s07-t10.md): 5-client reordering/duplication suites (5 files, 6 tests PASS); included in the current-head full run | PASS |
| 2 | NFR-01: zero acknowledged edits lost after controlled server restart | [S07-T10](../test-reports/s07-t10.md), S07-T11/T12 restart suites; recovery fail-closed-then-recover covered by `tests/e2e/recovery.spec.ts` on the current head | PASS |
| 3 | NFR-12: offline writes recoverable and never silently discarded, pending state visible | [S07-T05](../test-reports/s07-t05.md), [S07-T10](../test-reports/s07-t10.md) offline/reconnect suites; included in the current-head full run | PASS |
| 4 | NFR-03: revoked users cannot mutate REST or WSS and stop receiving newly unauthorized data | [S07-T08](../test-reports/s07-t08.md) manager-level; [S08-T08](../test-reports/s08-t08.md) propagation wiring plus lifecycle denials | PASS (sharing scope); session-revocation propagation stays manager-level, recorded as debt |
| 5 | COL-03 roles enforced on REST | S02/S03/S04/S07 guards plus [S08-T03](../test-reports/s08-t03.md) and [S08-T07](../test-reports/s08-t07.md) matrices | PASS |
| 6 | COL-04 invitations expire/revoke/stay project-scoped | [S08-T01](../test-reports/s08-t01.md), [S08-T08](../test-reports/s08-t08.md) | PASS |
| 7 | COL-05 share links bound, expiring, revocable | [S08-T02](../test-reports/s08-t02.md), [S08-T08](../test-reports/s08-t08.md) | PASS |
| 8 | COL-06 anchored comments with reply/resolve/detach | [S08-T04](../test-reports/s08-t04.md), [S08-T09](../test-reports/s08-t09.md), [S08-T08](../test-reports/s08-t08.md) | PASS |
| 9 | COL-07 durable authorized chat with rate limits | [S08-T05](../test-reports/s08-t05.md), [S08-T07](../test-reports/s08-t07.md) | PASS |
| 10 | Full unit/regression suite green on the merge head | `pnpm test` 355 files/1,262 tests PASS with coverage thresholds on the current head (outside-sandbox run recorded in the [G3 audit](gate-g3-audit.md) 2026-10-16) | PASS |
| 11 | Typecheck, lint, build, plan lint, secret scan, dependency audit | See Verification | PASS |

## Stabilization findings fixed in this task

- The S08-T06 dashboard notification region broke three S03-T03 dashboard suites (order-sensitive fetch mocks consumed the new `/me/notifications` call). Fixed by routing notification calls to an empty page in `tests/integration/s03-t03.test.ts`, `tests/regression/pro-01/s03-t03.test.ts` and `tests/regression/nfr-08/s03-t03.test.ts`; all pass.
- A type error in `tests/regression/nfr-03/s08-t08.test.ts` (GET-with-undefined-payload union) failed `tsc`; fixed with separate inject calls. The spawned-`pnpm` S00-T03 gate passes again.

## Known limits and debt carried forward

- Browser matrix is now green on the current head: `pnpm test:e2e` 34/34 across chromium, firefox and edge with local Mailpit settings ([G3 audit](gate-g3-audit.md) 2026-10-16). G2-scoped branch-time journeys also passed on Edge: invitation/link redemption ([S08-T03](s08-t03.md)), two-user chat ([S08-T05](s08-t05.md)) and the comment panel ([S08-T09](s08-t09.md)). The five-client convergence evidence remains protocol-level ([S07-T10](s07-t10.md)), not five real browsers — a scoping note, not a failure.
- GAP-29 Redis recovery is fixed and closed: the auth limiter now uses a bounded reconnect strategy (`apps/api/src/plugins/rate-limit.ts`), and `tests/e2e/recovery.spec.ts` polls `auth/session` back to a real answer after a Redis restart (covered by the current-head matrix).
- GAP-30 Firefox/SMTP is closed: Firefox runs in the current-head matrix and `.env` carries the documented Mailpit SMTP vars (see [G3 audit](gate-g3-audit.md)).
- Production migration ordering remains GAP-15 (covers the S08 `0009`–`0012` migrations).
- Session-revocation API→collab propagation is unwired; only sharing-scoped events publish. No session-revocation regression exists at the API level. Related: the collab invalidation subscriber keeps `reconnectStrategy: false` (`apps/api/src/modules/collab/invalidation.ts`); Redis-only restart recovery for sharing propagation is not regression-covered (`recovery.spec.ts` covers auth/session only). Denials are enforced at commit time and clients re-establish tickets on reconnect, so this is hardening debt, not a criteria failure.
- Entity-encoded XSS scheme smuggling is an open hardening option from S08-T07.
- Static OpenAPI generation/DTO parity remains GAP-12.

## Rollback and recovery

S08 sharing/chat code reached `main` through the reviewed merges ending at `14b4a06`; no force-push was used. Rollback is `git revert` of the S08 feature commits; no migrations ran against production and no data change is involved. Public signup and untrusted compilation stay disabled.

## Verification

| Check | Observed result |
|---|---|
| `pnpm test` (full unit/regression) | PASS: 355 files, 1,262 tests with coverage thresholds on the current head (outside-sandbox run recorded in the [G3 audit](gate-g3-audit.md) 2026-10-16; S08 code unchanged since the G2 head except formatting) |
| `pnpm test:integration` | PASS: 3/3 on the current head (local services) |
| `pnpm typecheck`; `pnpm lint` | PASS on the current head |
| `pnpm build` | PASS on the current head |
| `python scripts/plan_lint.py` | PASS: 184 tasks, 93 requirements, 16 stages |
| `node scripts/check-secrets.mjs`; `pnpm audit --audit-level high` | PASS; no known vulnerabilities |
| `pnpm exec playwright test` (full E2E) | PASS: 34/34 across chromium, firefox and edge on the current head with local Mailpit settings ([G3 audit](gate-g3-audit.md)); closes the G2-era NOT RUN |
| This session (sandbox) | `plan_lint.py` PASS here; service/browser suites NOT RUN in this checkout (sandbox blocks the pnpm symlink and service connections per GAP-24) — evidence cited from the recorded outside-sandbox runs above |
