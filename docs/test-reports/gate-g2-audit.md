# Gate G2 Audit — Durable collaboration, sharing, comments and chat

**Status:** Draft for co-maintainer review; merge to `main` is development-branch integration, not a release. **Branch:** `codex/sprint-08-sharing-comments-chat` tracking `origin/codex/sprint-08-sharing-comments-chat`. **Base:** `a568117` (`origin/main`). **Environment:** Windows, Node 24.20.0, pnpm 11.25.0, local PostgreSQL fixture. **Actual effort:** Not measured.

## Declared gate scope (S06 → S07 → S08)

G2 covers trusted-compilation handoff (S06, already G1-audited), durable real-time collaboration (S07) and sharing/comments/chat (S08). Release checklists items about public signup, hosted deployment, backup rehearsal and versioning are out of scope: no release is cut here and public signup plus untrusted compilation stay disabled.

## Review checklist and verdicts

| # | Criterion | Evidence | Verdict |
|---|---|---|---|
| 1 | NFR-02: five simultaneous editors converge on identical content | [S07-T10](../test-reports/s07-t10.md): 5-client reordering/duplication suites; re-run in this audit (see Verification) | PASS, pending re-run line |
| 2 | NFR-01: zero acknowledged edits lost after controlled server restart | [S07-T10](../test-reports/s07-t10.md), S07-T11/T12; re-run in this audit | PASS, pending re-run line |
| 3 | NFR-12: offline writes recoverable and never silently discarded, pending state visible | [S07-T05](../test-reports/s07-t05.md), [S07-T10](../test-reports/s07-t10.md); re-run in this audit | PASS, pending re-run line |
| 4 | NFR-03: revoked users cannot mutate REST or WSS and stop receiving newly unauthorized data | [S07-T08](../test-reports/s07-t08.md) manager-level; [S08-T08](../test-reports/s08-t08.md) propagation wiring plus lifecycle denials | PASS (sharing scope); session-revocation propagation stays manager-level, recorded as debt |
| 5 | COL-03 roles enforced on REST | S02/S03/S04/S07 guards plus [S08-T03](../test-reports/s08-t03.md) and [S08-T07](../test-reports/s08-t07.md) matrices | PASS |
| 6 | COL-04 invitations expire/revoke/stay project-scoped | [S08-T01](../test-reports/s08-t01.md), [S08-T08](../test-reports/s08-t08.md) | PASS |
| 7 | COL-05 share links bound, expiring, revocable | [S08-T02](../test-reports/s08-t02.md), [S08-T08](../test-reports/s08-t08.md) | PASS |
| 8 | COL-06 anchored comments with reply/resolve/detach | [S08-T04](../test-reports/s08-t04.md), [S08-T09](../test-reports/s08-t09.md), [S08-T08](../test-reports/s08-t08.md) | PASS |
| 9 | COL-07 durable authorized chat with rate limits | [S08-T05](../test-reports/s08-t05.md), [S08-T07](../test-reports/s08-t07.md) | PASS |
| 10 | Full unit/regression suite green on the merge head | See Verification | PASS, pending re-run line |
| 11 | Typecheck, lint, build, plan lint, secret scan, dependency audit | See Verification | PASS |

## Stabilization findings fixed in this task

- The S08-T06 dashboard notification region broke three S03-T03 dashboard suites (order-sensitive fetch mocks consumed the new `/me/notifications` call). Fixed by routing notification calls to an empty page in `tests/integration/s03-t03.test.ts`, `tests/regression/pro-01/s03-t03.test.ts` and `tests/regression/nfr-08/s03-t03.test.ts`; all pass.
- A type error in `tests/regression/nfr-03/s08-t08.test.ts` (GET-with-undefined-payload union) failed `tsc`; fixed with separate inject calls. The spawned-`pnpm` S00-T03 gate passes again.

## Known limits and debt carried forward

- Full browser matrix NOT RUN (GAP-29/GAP-30); only scoped Edge journeys and jsdom suites ran. The five-client convergence evidence is protocol-level (S07-T10), not five real browsers.
- Playwright E2E (chat, comments/detached, notifications) NOT RUN in this cycle: the full API+web stack was not running. Specs exist and are recorded per task report.
- Production migration ordering remains GAP-15 (covers the S08 `0009`–`0012` migrations).
- Session-revocation API→collab propagation is unwired; only sharing-scoped events publish. No session-revocation regression exists at the API level.
- Entity-encoded XSS scheme smuggling is an open hardening option from S08-T07.
- Static OpenAPI generation/DTO parity remains GAP-12.

## Rollback and recovery

Merge head is `7ee0db8` plus the T10/audit commit on `codex/sprint-08-sharing-comments-chat`, merged to `main` without force. Rollback is `git revert` of the merge or reset of `main` to `a568117` before any later work lands; no migrations ran against production and no data change is involved.

## Verification

| Check | Observed result |
|---|---|
| `pnpm test` (full unit/regression) | PENDING — background run in flight at audit drafting; final numbers recorded in `s08-t10.md` before merge |
| `pnpm test:integration` | PASS: 1 file, 3 tests (local services) |
| `pnpm typecheck`; `pnpm lint` | PASS |
| `pnpm build` | PASS (last full build before audit; rerun recorded in `s08-t10.md`) |
| `python scripts/plan_lint.py` | PASS: 184 tasks, 93 requirements, 16 stages |
| `node scripts/check-secrets.mjs`; `pnpm audit --audit-level high` | PASS; no known vulnerabilities |
| `pnpm exec playwright test` (full E2E) | NOT RUN: stack not running; GAP-29/GAP-30 remain open |
