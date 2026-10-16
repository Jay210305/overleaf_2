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
| [S08-T09](../../implementation/sprint-08-sharing-comments-chat/S08-T09-render-comment-anchor-and-reply-interactions.md) | DONE; user review confirmed 2026-10-15 | Not measured | [Mounted anchor highlights, reply flow and Edge report](../test-reports/s08-t09.md) |
| [S08-T05](../../implementation/sprint-08-sharing-comments-chat/S08-T05-create-authorized-durable-project-chat.md) | DONE; user review confirmed 2026-10-15 | Not measured | [Durable chat API, WSS, browser and denial report](../test-reports/s08-t05.md) |
| [S08-T06](../../implementation/sprint-08-sharing-comments-chat/S08-T06-create-mention-and-in-app-notifications.md) | DONE; user review confirmed 2026-10-15 | Not recorded | [Mention/notification API, idempotency and UI report](../test-reports/s08-t06.md) |
| [S08-T07](../../implementation/sprint-08-sharing-comments-chat/S08-T07-enforce-comment-chat-safety-and-limits.md) | DONE; user review confirmed 2026-10-15 | Not recorded | [Comment/chat safety, XSS backstop and rate-limit report](../test-reports/s08-t07.md) |
| [S08-T08](../../implementation/sprint-08-sharing-comments-chat/S08-T08-verify-sharing-revocation-and-detached-anchors.md) | DONE; user review confirmed 2026-10-15 | Not recorded | [Revocation propagation, lifecycle denials and detached-anchor report](../test-reports/s08-t08.md) |
| [S08-T10](../../implementation/sprint-08-sharing-comments-chat/S08-T10-stabilize-and-review-g2-collaboration.md) | IN_PROGRESS; audit drafted, review pending | Not recorded | [G2 stabilization evidence](test-reports/s08-t10.md) and [gate audit](test-reports/gate-g2-audit.md) |

## Decisions and Migrations

S08-T01 adds `0009-project-invitations.sql` and [ADR-010](../adr/010-invitation-tokens.md). The invitation token moved from the planned path to a JSON request body and fragment URL; contract version 2.0.0 reflects this breaking shape. Production migration ordering remains GAP-15.

S08-T02 adds `0010-share-link-grants.sql`, the `active_project_members` authorization view and [ADR-011](../adr/011-share-link-grants.md). Share-link redemption also moves to a strict JSON body; the current contract is version 3.0.0. Production ordering for both S08 migrations remains GAP-15.

## Validation

Focused S08-T01 PostgreSQL and Mailpit tests passed (2 files, 11 tests). Typecheck and lint passed with the pinned pnpm CLI on Windows/Node 24.20.0. Other shared gate results and scope limitations are recorded in the [task report](../test-reports/s08-t01.md); G2 is not released.

Focused S08-T02 PostgreSQL tests passed (2 files, 6 tests); the latest full unit/regression run passed 239 files/634 tests after correcting parallel fixture DDL and a global-count assertion. Lint, typecheck, configured integration and build passed. The [S08-T02 report](../test-reports/s08-t02.md) records checks and limits; G2 is not released.

S08-T03 added server-enforced owner member changes and sharing UI with real Edge invitation/link redemption. Focused PostgreSQL and UI checks passed, and the latest isolated full run passed 243 files/644 tests. Lint, typecheck, build and the configured integration suite passed. The [S08-T03 report](../test-reports/s08-t03.md) records the transient concurrent-run failure, scoped axe result and remaining scope limits; G2 is not released.

S08-T04 added anchored comment threads with replies/resolve/reopen, detached-range handling and the thread UI. Focused S08-T04 PostgreSQL and regression checks passed repeatedly (3 files, 5 tests) after fixing a Yjs root-wrapper ordering bug that detached every valid anchor; typecheck, lint, build steps, configured integration, plan validator and secret scan passed. The [S08-T04 report](../test-reports/s08-t04.md) records the finding and checks not run; COL-06 and G2 are not DONE.

S08-T09 mounted the anchor interaction surface in the workspace with source-verified range excerpts, reply/resolve/reopen/delete, mention-aware composer and detached reasons. The latest focused PostgreSQL and regression run passed (3 files, 8 tests), and the full Vitest run passed (249 files, 657 tests). A real Edge journey passed creation, reply, resolve/reopen, keyboard select-all and scoped axe with zero serious/critical violations. Typecheck, lint, build and plan lint passed. Project Co-owner review was accepted 2026-10-15. The [S08-T09 report](../test-reports/s08-t09.md) records commands and the full-browser-matrix limit; COL-06, NFR-08 and G2 are not DONE.

S08-T05 adds authorized persistent chat messages with cursor pagination and read-only WSS invalidation derived from committed rows. The browser reconciles via REST after hints, reconnect, focus and polling while retaining loaded older pages. Focused PostgreSQL/UI checks passed (2 files, 6 tests), full Vitest passed (251 files, 663 tests), and the real Edge two-user journey and scoped axe passed with zero serious/critical findings; typecheck, lint, build, plan lint and secret scan passed. Project Co-owner review was accepted 2026-10-15. [S08-T05 evidence](../test-reports/s08-t05.md) records the initial red older-page regression and limits. S08-T07 still owns chat rate limits; COL-07 and G2 remain IN_PROGRESS.

S08-T06 adds transactional mention/reply notifications with preference checks, idempotent redelivery via `0012-notification-idempotency.sql`, project-scoped private listing, one-time mark-read and a dashboard UI region. Focused PostgreSQL and UI checks passed (3 files, 5 tests); typecheck, lint, build, plan lint and secret scan passed. The Playwright Edge journey exists but was NOT RUN in this session (stack not running). [S08-T06 evidence](../test-reports/s08-t06.md) records commands and limits; user review was confirmed 2026-10-15. COL-06, COL-13 and G2 remain IN_PROGRESS.

## Risks and Debt

The production migration runner/ordering gap (GAP-15) affects the S08 migrations. Full browser matrix GAP-23/GAP-24 remains separate, and the inherited empty file-tree accessibility finding is GAP-26. Independent review of S08-T01–T05 and T09 was confirmed 2026-10-15. Collaboration-socket closure on link expiry/revocation is now wired through `collab:invalidations` under S08-T08 with review pending. S08-T10 remains unstarted.

## Next Task

S08-T06 mention and in-app notifications are DONE with user review confirmed 2026-10-15. Proceed to S08-T07 safety and limits. S08-T08 must verify closure of already-open collaboration sockets after expiry/revocation.

S08-T07 adds transactional body policy (XSS backstop plus `vbscript:` closure) and PostgreSQL-backed sliding-window flood limits for comment/reply/chat writes, with the writer-role helper shared by both routes. Focused checks passed (4 files, 17 tests); typecheck, lint, build, plan lint and secret scan passed. [S08-T07 evidence](../test-reports/s08-t07.md) records the red-green path and limits; user review was confirmed 2026-10-15.

S08-T08 closes the sharing-revocation propagation gap (API now publishes member/role/link events to `collab:invalidations`) and verifies the full lifecycle: expired/revoked/consumed invitations and links denied, redemption project-bound, wrong-project and viewer writes rejected, reply/resolve/reopen and permission-aware delete intact, deleted ranges detached, and revoked members cut off from REST, tickets and notifications. Focused checks passed (6 files, 16 tests); typecheck, lint, build, plan lint and secret scan passed. [S08-T08 evidence](../test-reports/s08-t08.md) records the red-green path and limits; review is pending and COL-04, COL-05, COL-06, NFR-03 and G2 remain IN_PROGRESS.
