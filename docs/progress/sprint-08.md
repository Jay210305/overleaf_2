# S08 — Sharing comments chat and G2 release

**Status:** IN_PROGRESS | **Owner:** Julio (proposed A-02) | **Estimate:** 72 h (A-03)

**Branch:** `codex/sprint-08-sharing-comments-chat`, published to `origin` with upstream; base `a568117` (`origin/main`, after S07). Actual sprint effort is not measured.

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S08-T01](../../implementation/sprint-08-sharing-comments-chat/S08-T01-implement-expiring-email-invitations.md) | IN_PROGRESS; review pending | Not measured | [Invitation API, Mailpit and regression report](../test-reports/s08-t01.md) |
| [S08-T02](../../implementation/sprint-08-sharing-comments-chat/S08-T02-implement-bounded-hashed-share-links.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T03](../../implementation/sprint-08-sharing-comments-chat/S08-T03-create-sharing-and-role-management-ui.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T04](../../implementation/sprint-08-sharing-comments-chat/S08-T04-implement-anchored-comments-and-replies.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T09](../../implementation/sprint-08-sharing-comments-chat/S08-T09-render-comment-anchor-and-reply-interactions.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T05](../../implementation/sprint-08-sharing-comments-chat/S08-T05-create-authorized-durable-project-chat.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T06](../../implementation/sprint-08-sharing-comments-chat/S08-T06-create-mention-and-in-app-notifications.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T07](../../implementation/sprint-08-sharing-comments-chat/S08-T07-enforce-comment-chat-safety-and-limits.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T08](../../implementation/sprint-08-sharing-comments-chat/S08-T08-verify-sharing-revocation-and-detached-anchors.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S08-T10](../../implementation/sprint-08-sharing-comments-chat/S08-T10-stabilize-and-review-g2-collaboration.md) | NOT_STARTED | Not recorded | No implementation evidence |

## Decisions and Migrations

S08-T01 adds `0009-project-invitations.sql` and [ADR-010](../adr/010-invitation-tokens.md). The invitation token moved from the planned path to a JSON request body and fragment URL; contract version 2.0.0 reflects this breaking shape. Production migration ordering remains GAP-15.

## Validation

Focused S08-T01 PostgreSQL and Mailpit tests passed (2 files, 11 tests). Typecheck and lint passed with the pinned pnpm CLI on Windows/Node 24.20.0. Other shared gate results and scope limitations are recorded in the [task report](../test-reports/s08-t01.md); G2 is not released.

## Risks and Debt

The production migration runner/ordering gap (GAP-15) affects this new migration. Full browser matrix GAP-23/GAP-24 remains separate. S08-T01 still needs independent co-maintainer review; all later S08 tasks remain unstarted.

## Next Task

S08-T01 independent review. Then S08-T02, subject to its dependency and contract gates.
