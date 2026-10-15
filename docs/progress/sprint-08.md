# S08 — Sharing comments chat and G2 release

**Status:** IN_PROGRESS | **Owner:** Julio (proposed A-02) | **Estimate:** 72 h (A-03)

**Branch:** `codex/sprint-08-sharing-comments-chat`, published to `origin` with upstream; base `a568117` (`origin/main`, after S07). Actual sprint effort is not measured.

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S08-T01](../../implementation/sprint-08-sharing-comments-chat/S08-T01-implement-expiring-email-invitations.md) | DONE; user review confirmed 2026-10-15 | Not measured | [Invitation API, Mailpit and regression report](../test-reports/s08-t01.md) |
| [S08-T02](../../implementation/sprint-08-sharing-comments-chat/S08-T02-implement-bounded-hashed-share-links.md) | DONE; user review confirmed 2026-10-15 | Not measured | [Hashed link API, expiry and WSS ticket regression](../test-reports/s08-t02.md) |
| [S08-T03](../../implementation/sprint-08-sharing-comments-chat/S08-T03-create-sharing-and-role-management-ui.md) | DONE; user review confirmed 2026-10-15 | Not measured | [Member API, sharing dialog and Edge report](../test-reports/s08-t03.md) |
| [S08-T04](../../implementation/sprint-08-sharing-comments-chat/S08-T04-implement-anchored-comments-and-replies.md) | DONE; user review confirmed 2026-10-15 | Not measured | [Anchored comment API, thread UI and regression report](../test-reports/s08-t04.md) |
| [S08-T09](../../implementation/sprint-08-sharing-comments-chat/S08-T09-render-comment-anchor-and-reply-interactions.md) | IN_PROGRESS; independent review pending | Not measured | [Mounted anchor highlights, reply flow and keyboard report](../test-reports/s08-t09.md) |
| [S08-T05](../../implementation/sprint-08-sharing-comments-chat/S08-T05-create-authorized-durable-project-chat.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T06](../../implementation/sprint-08-sharing-comments-chat/S08-T06-create-mention-and-in-app-notifications.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T07](../../implementation/sprint-08-sharing-comments-chat/S08-T07-enforce-comment-chat-safety-and-limits.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T08](../../implementation/sprint-08-sharing-comments-chat/S08-T08-verify-sharing-revocation-and-detached-anchors.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T10](../../implementation/sprint-08-sharing-comments-chat/S08-T10-stabilize-and-review-g2-collaboration.md) | NOT_STARTED | Not recorded | No implementation evidence |

## Decisions and Migrations

S08-T01 adds `0009-project-invitations.sql` and [ADR-010](../adr/010-invitation-tokens.md). The invitation token moved from the planned path to a JSON request body and fragment URL; contract version 2.0.0 reflects this breaking shape. Production migration ordering remains GAP-15.

S08-T02 adds `0010-share-link-grants.sql`, the `active_project_members` authorization view and [ADR-011](../adr/011-share-link-grants.md). Share-link redemption also moves to a strict JSON body; the current contract is version 3.0.0. Production ordering for both S08 migrations remains GAP-15.

## Validation

Focused S08-T01 PostgreSQL and Mailpit tests passed (2 files, 11 tests). Typecheck and lint passed with the pinned pnpm CLI on Windows/Node 24.20.0. Other shared gate results and scope limitations are recorded in the [task report](../test-reports/s08-t01.md); G2 is not released.

Focused S08-T02 PostgreSQL tests passed (2 files, 6 tests); the latest full unit/regression run passed 239 files/634 tests after correcting parallel fixture DDL and a global-count assertion. Lint, typecheck, configured integration and build passed. The [S08-T02 report](../test-reports/s08-t02.md) records checks and limits; G2 is not released.

S08-T03 added server-enforced owner member changes and sharing UI with real Edge invitation/link redemption. Focused PostgreSQL and UI checks passed, and the latest isolated full run passed 243 files/644 tests. Lint, typecheck, build and the configured integration suite passed. The [S08-T03 report](../test-reports/s08-t03.md) records the transient concurrent-run failure, scoped axe result and review limit; G2 is not released.

S08-T04 added anchored comment threads with replies/resolve/reopen, detached-range handling and the thread UI. Focused S08-T04 PostgreSQL and regression checks passed repeatedly (3 files, 5 tests) after fixing a Yjs root-wrapper ordering bug that detached every valid anchor; typecheck, lint, build steps, configured integration, plan validator and secret scan passed. The [S08-T04 report](../test-reports/s08-t04.md) records the finding, the checks not run and the review limit; COL-06 and G2 are not DONE.

S08-T09 mounted the anchor interaction surface in the workspace with visible range highlights, reply/resolve/reopen/delete, mention-aware composer and detached reasons. Focused S08-T09 PostgreSQL and regression checks passed repeatedly (3 files, 7 tests); typecheck, lint, web build, targeted Prettier and secret scan passed. The [S08-T09 report](../test-reports/s08-t09.md) records the manual keyboard review, the checks not run and the review limit; COL-06, NFR-08 and G2 are not DONE.

## Risks and Debt

The production migration runner/ordering gap (GAP-15) affects both S08 migrations. Full browser matrix GAP-23/GAP-24 remains separate, and the inherited empty file-tree accessibility finding is GAP-26. The user confirmed review of S08-T01/T02 on 2026-10-15, resolving GAP-25. An already-open socket is not yet closed on link expiry/revocation. S08-T03 awaits review; S08-T04–T10 remain unstarted.

## Next Task

Review S08-T09 comment anchor and reply interactions, then proceed to S08-T05 authorized durable project chat. S08-T08 must verify closure of already-open sockets after expiry/revocation.
